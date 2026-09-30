/**
 * Descarga robusta de archivos grandes desde la API autenticada.
 *
 * ── Problema que resuelve ──────────────────────────────────────────────────
 * El helper genérico `api.download` aplicaba un timeout de 30 s (AbortController)
 * y buffereaba el archivo completo en memoria (Blob). Para un video de >1 GB:
 *   1. la descarga se ABORTABA a mitad de camino (a los 30 s), y
 *   2. aunque no se abortara, cargar 1.37 GB en memoria podía crashear la pestaña.
 *
 * ── Estrategia (progressive enhancement) ───────────────────────────────────
 *   • Chromium / Edge (File System Access API): escribe a disco EN STREAMING
 *     (memoria constante) y reporta progreso real para una barra in-app.
 *   • Firefox / Safari: descarga NATIVA del navegador vía `?token=`
 *     (streaming a disco, reanudable, sin límite de tamaño ni timeout). El
 *     progreso lo muestra el propio navegador.
 *
 * Sin timeout en ambos casos: los archivos grandes tardan minutos.
 */

import { API_BASE } from './api'

export interface DownloadProgress {
  /** Bytes descargados hasta ahora. */
  loaded: number
  /** Tamaño total en bytes (0 si el servidor no envía Content-Length). */
  total: number
  /** Porcentaje 0-100 (0 si `total` es desconocido). */
  percent: number
}

export interface DownloadOptions {
  /** Nombre de archivo sugerido para el diálogo de guardado. */
  filename?: string
  /** Callback de progreso (solo en la ruta con streaming). */
  onProgress?: (progress: DownloadProgress) => void
  /** Señal externa para cancelar la descarga. */
  signal?: AbortSignal
}

// =====================================================
// File System Access API (aún no tipada en lib.dom de TS)
// =====================================================

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description?: string; accept: Record<string, string[]> }[]
}

interface FileSystemWritable {
  write(data: BufferSource | Blob | string): Promise<void>
  close(): Promise<void>
  abort(reason?: unknown): Promise<void>
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritable>
}

type ShowSaveFilePicker = (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>

function getShowSaveFilePicker(): ShowSaveFilePicker | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }
  return typeof w.showSaveFilePicker === 'function' ? w.showSaveFilePicker.bind(window) : null
}

/** `true` si el navegador puede descargar en streaming a disco con progreso. */
export function supportsStreamingDownload(): boolean {
  return getShowSaveFilePicker() !== null
}

// =====================================================
// Helpers internos
// =====================================================

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * URL con el JWT como query param (`?token=`) para descargas nativas, que no
 * pueden enviar headers Authorization. El middleware `authenticate()` del
 * backend lo acepta (mismo patrón que `mediaProxyUrl`).
 */
function buildNativeUrl(path: string): string {
  const token = localStorage.getItem('auth_token') ?? ''
  const sep = path.includes('?') ? '&' : '?'
  return `${API_BASE}${path}${sep}token=${encodeURIComponent(token)}`
}

// =====================================================
// Estrategias
// =====================================================

/** Descarga nativa del navegador (Firefox/Safari). Streaming a disco, sin RAM. */
function downloadNative(path: string, filename?: string): void {
  const anchor = document.createElement('a')
  anchor.href = buildNativeUrl(path)
  anchor.rel = 'noopener'
  if (filename) anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

/** Streaming a disco con progreso vía File System Access API (Chromium). */
async function downloadStreaming(path: string, opts: DownloadOptions): Promise<void> {
  const showSaveFilePicker = getShowSaveFilePicker()
  if (!showSaveFilePicker) throw new Error('showSaveFilePicker not available')

  // 1) Pedir el destino PRIMERO: conserva la "activación de usuario" del click.
  //    Si hiciéramos un `await` (fetch) antes, el navegador podría bloquear el
  //    diálogo por perder la activación transitoria.
  const handle = await showSaveFilePicker({ suggestedName: opts.filename })

  // 2) Fetch SIN timeout (los archivos grandes tardan minutos).
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeader(),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`)
  }

  const total = Number(res.headers.get('content-length')) || 0
  const writable = await handle.createWritable()
  const reader = res.body.getReader()
  let loaded = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        await writable.write(value)
        loaded += value.byteLength
        opts.onProgress?.({
          loaded,
          total,
          percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
        })
      }
    }
    await writable.close()
  } catch (err) {
    await writable.abort(err)
    throw err
  }
}

/**
 * Descarga un archivo de la API de la forma más robusta según el navegador.
 * @returns `'streamed'` (progreso in-app) o `'native'` (descarga del navegador).
 */
export async function downloadFile(
  path: string,
  opts: DownloadOptions = {}
): Promise<'streamed' | 'native'> {
  if (supportsStreamingDownload()) {
    await downloadStreaming(path, opts)
    return 'streamed'
  }
  downloadNative(path, opts.filename)
  return 'native'
}
