/**
 * Subida por chunks de grabaciones largas (contrato chunked-upload).
 *
 * Flujo:
 *   1. POST /videos/upload-chunk  (uno por cada parte, SECUENCIAL, con reintentos)
 *   2. POST /videos/upload-complete (gatilla ensamblado + remux + SeaweedFS + BD)
 *
 * Dos modos de uso:
 *   - `createStreamingUploader`: el MediaRecorder entrega chunks por timeslice
 *     mientras graba; se encolan y suben al vuelo (no acumula el video en RAM).
 *   - `uploadBlobInChunks`: parte un Blob ya existente en trozos de ~8MB
 *     (fallback / flujo legacy con el blob completo en memoria).
 *
 * Reglas: sin timeout (api.upload ya usa timeoutMs=0), subida secuencial,
 * 2 reintentos por chunk con backoff, y errores reales propagados al caller.
 */

import { api, ApiError } from './api'

/** Tamaño de parte cuando se corta un Blob completo (~8MB). */
export const BLOB_CHUNK_SIZE = 8 * 1024 * 1024

/** Reintentos por chunk antes de dar por fallida la subida. */
const CHUNK_RETRIES = 2

/** Espera base entre reintentos (backoff exponencial: 800ms, 1600ms). */
const RETRY_BASE_DELAY_MS = 800

/** Respuesta del backend en upload-complete (misma forma que /upload). */
export interface UploadCompleteData {
  video: {
    id: string
    title: string
    status: string
    duration_seconds?: number
    storage_key?: string
  }
  upload_url?: string
}

/** Progreso reportado a la UI. */
export interface ChunkUploadProgress {
  /** Chunks confirmados por el backend. */
  uploadedChunks: number
  /** Total de chunks conocidos (en streaming crece mientras graba). */
  totalChunks: number
  /** Bytes confirmados. */
  uploadedBytes: number
  /** Bytes totales conocidos. */
  totalBytes: number
  /** 0-100. En streaming es aproximado (total desconocido hasta detener). */
  percent: number
  /** true cuando ya se envió upload-complete. */
  done: boolean
}

export interface ChunkedUploadOptions {
  /** Nombre original del archivo (ej: recording-1699.webm). */
  filename: string
  /** MIME de la grabación (ej: video/webm;codecs=vp9,opus). */
  mimeType: string
  /** Título del video para la BD. */
  title: string
  /** Descripción opcional. */
  description?: string
  /** Duración en segundos (fallback; el backend recalcula con ffprobe). */
  durationSeconds?: number
  /** Callback de progreso para la UI. */
  onProgress?: (progress: ChunkUploadProgress) => void
}

/** Genera un uploadId único para la sesión (UUID v4 con fallback). */
export function newUploadId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback para contextos sin crypto.randomUUID (http no-localhost)
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Extrae un mensaje legible de cualquier error (el backend included). */
export function describeUploadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return 'El chunk excede el límite de tamaño del servidor (413)'
    if (err.status === 401) return 'Sesión expirada, vuelve a iniciar sesión (401)'
    return err.message || `Error del servidor (HTTP ${err.status})`
  }
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Sube UN chunk con reintentos. Idempotente: el backend sobrescribe el mismo
 * índice si ya existe, así que reintentar es seguro.
 */
async function sendChunk(params: {
  uploadId: string
  chunkIndex: number
  totalChunks: number
  filename: string
  mimeType: string
  blob: Blob
}): Promise<void> {
  const { uploadId, chunkIndex, totalChunks, filename, mimeType, blob } = params

  let lastError: unknown = null
  for (let attempt = 0; attempt <= CHUNK_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
      console.warn(`[CHUNK] ↻ Reintento ${attempt}/${CHUNK_RETRIES} del chunk ${chunkIndex} en ${delay}ms`)
      await sleep(delay)
    }

    const fd = new FormData()
    fd.append('uploadId', uploadId)
    fd.append('chunkIndex', String(chunkIndex))
    fd.append('totalChunks', String(totalChunks))
    fd.append('filename', filename)
    fd.append('mimeType', mimeType)
    fd.append('file', blob, `${filename}.part${chunkIndex}`)

    try {
      console.log(`[CHUNK] ⬆️ Chunk ${chunkIndex} (${blob.size} bytes) -> /videos/upload-chunk`)
      await api.upload('/videos/upload-chunk', fd)
      return
    } catch (err) {
      lastError = err
      console.error(`[CHUNK] ❌ Falló chunk ${chunkIndex} (intento ${attempt + 1}):`, describeUploadError(err))
    }
  }

  throw new Error(
    `No se pudo subir el chunk ${chunkIndex + 1} tras ${CHUNK_RETRIES + 1} intentos: ${describeUploadError(lastError)}`
  )
}

/** Envía upload-complete (JSON, sin timeout) y devuelve el registro creado. */
async function sendComplete(params: {
  uploadId: string
  totalChunks: number
  title: string
  description?: string
  durationSeconds?: number
}): Promise<UploadCompleteData> {
  const { uploadId, totalChunks, title, description, durationSeconds } = params

  console.log(`[UPLOAD] 🏁 upload-complete: ${totalChunks} chunks, título "${title}"`)
  // IMPORTANTE: upload-complete NO lleva archivo (solo metadatos). Se envía como
  // JSON porque el endpoint backend NO usa multer — express.json() no parsea
  // multipart, así que un FormData aquí llegaría con req.body vacío (400).
  const res = await api.post<{ success: boolean; data: UploadCompleteData }>(
    '/videos/upload-complete',
    {
      uploadId,
      totalChunks,
      title,
      description: description ?? undefined,
      duration_seconds: durationSeconds !== undefined && Number.isFinite(durationSeconds)
        ? String(Math.round(durationSeconds))
        : undefined,
    }
  )
  if (!res?.success || !res.data) {
    throw new Error('El servidor no confirmó el ensamblado del video (respuesta inválida en upload-complete)')
  }
  return res.data
}

/**
 * Uploader en STREAMING: recibe chunks del MediaRecorder (timeslice) y los
 * sube de a uno, en orden, sin acumular el video completo en memoria.
 *
 * Uso:
 *   const up = createStreamingUploader({ filename, mimeType, title })
 *   up.push(chunk)        // por cada ondataavailable
 *   const data = await up.finish(durationSeconds)  // al detener la grabación
 */
export interface StreamingUploader {
  readonly uploadId: string
  /** Encola un chunk; la subida es secuencial (una promesa encadenada). */
  push: (chunk: Blob) => void
  /** Espera la cola y envía upload-complete. */
  finish: (durationSeconds?: number) => Promise<UploadCompleteData>
  /** Marca la subida como abortada (la cola deja de enviar). */
  abort: () => void
  /** Error de la cola, si alguno (para mostrarlo al reintentar). */
  readonly error: Error | null
  readonly uploadedChunks: number
  readonly uploadedBytes: number
}

export function createStreamingUploader(options: ChunkedUploadOptions): StreamingUploader {
  const uploadId = newUploadId()
  const { filename, mimeType, title, description, onProgress } = options

  // Cola secuencial: cada push encadena sobre la promesa anterior.
  let queue: Promise<void> = Promise.resolve()
  let queuedChunks = 0
  let uploadedChunks = 0
  let uploadedBytes = 0
  let aborted = false
  let queueError: Error | null = null

  console.log(`[UPLOAD] 🚀 Streaming upload iniciado: uploadId=${uploadId}, file=${filename}`)

  const report = (done: boolean): void => {
    // En streaming el total de bytes es desconocido hasta detener la grabación:
    // reportamos uploadedBytes como piso y el % por cantidad de chunks.
    onProgress?.({
      uploadedChunks,
      totalChunks: Math.max(queuedChunks, uploadedChunks),
      uploadedBytes,
      totalBytes: uploadedBytes,
      percent: done ? 100 : queuedChunks > 0 ? Math.min(99, Math.round((uploadedChunks / queuedChunks) * 100)) : 0,
      done,
    })
  }

  const push = (chunk: Blob): void => {
    if (aborted || !chunk || chunk.size === 0) return
    const chunkIndex = queuedChunks++
    queue = queue.then(async () => {
      if (aborted) return
      if (queueError) throw queueError
      // totalChunks aún desconocido en streaming: enviamos el piso conocido.
      await sendChunk({
        uploadId,
        chunkIndex,
        totalChunks: Math.max(queuedChunks, chunkIndex + 1),
        filename,
        mimeType,
        blob: chunk,
      })
      uploadedChunks++
      uploadedBytes += chunk.size
      console.log(`[UPLOAD] ✅ Chunk ${chunkIndex} ok (${uploadedChunks}/${queuedChunks}, ${uploadedBytes} bytes)`)
      report(false)
    }).catch((err: unknown) => {
      queueError = err instanceof Error ? err : new Error(describeUploadError(err))
      throw queueError
    })
    // El error se consume en finish(); evitamos un unhandled rejection acá.
    queue = queue.catch(() => undefined)
  }

  const finish = async (durationSeconds?: number): Promise<UploadCompleteData> => {
    await queue
    if (queueError) throw queueError
    if (uploadedChunks === 0) throw new Error('La grabación no generó datos para subir (0 chunks)')

    const totalChunks = uploadedChunks
    report(false)
    const data = await sendComplete({
      uploadId,
      totalChunks,
      title,
      description,
      durationSeconds: durationSeconds ?? options.durationSeconds,
    })
    report(true)
    return data
  }

  return {
    uploadId,
    push,
    finish,
    abort: () => { aborted = true },
    get error() { return queueError },
    get uploadedChunks() { return uploadedChunks },
    get uploadedBytes() { return uploadedBytes },
  }
}

/**
 * Fallback: parte un Blob completo en trozos de ~8MB y los sube en orden.
 * Útil si el streaming no está disponible (o para re-subir un blob existente).
 */
export async function uploadBlobInChunks(
  blob: Blob,
  options: ChunkedUploadOptions
): Promise<UploadCompleteData> {
  const uploadId = newUploadId()
  const { filename, mimeType, title, description, durationSeconds, onProgress } = options

  const totalChunks = Math.max(1, Math.ceil(blob.size / BLOB_CHUNK_SIZE))
  console.log(
    `[UPLOAD] 🚀 Blob chunked upload: uploadId=${uploadId}, ${blob.size} bytes en ${totalChunks} chunks`
  )

  let uploadedBytes = 0
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * BLOB_CHUNK_SIZE
    const part = blob.slice(start, Math.min(start + BLOB_CHUNK_SIZE, blob.size))
    await sendChunk({ uploadId, chunkIndex, totalChunks, filename, mimeType, blob: part })
    uploadedBytes += part.size
    onProgress?.({
      uploadedChunks: chunkIndex + 1,
      totalChunks,
      uploadedBytes,
      totalBytes: blob.size,
      percent: Math.round(((chunkIndex + 1) / totalChunks) * 100),
      done: false,
    })
  }

  const data = await sendComplete({ uploadId, totalChunks, title, description, durationSeconds })
  onProgress?.({
    uploadedChunks: totalChunks,
    totalChunks,
    uploadedBytes,
    totalBytes: blob.size,
    percent: 100,
    done: true,
  })
  return data
}
