import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, MicOff, Monitor, Camera, Circle, Square, Pause, Play, Upload, Film, Clock, RefreshCw, X, PictureInPicture2 } from 'lucide-react'
import { cn, mediaProxyUrl } from '../lib/utils'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import type { RecordingMode } from '../hooks/useMediaRecorder'
import CameraPreview from '../components/CameraPreview'
import ScreenPreview from '../components/ScreenPreview'
import { useBackgroundRemoval } from "../hooks/useBackgroundRemoval"
import { usePictureInPicture } from '../hooks/usePictureInPicture'
import BackgroundSelector from "../components/BackgroundSelector"
import { ImagePlus } from "lucide-react"
import { api } from '../lib/api'
import type { ApiResponse } from '../lib/api'
import {
  createStreamingUploader,
  uploadBlobInChunks,
  describeUploadError,
} from '../lib/chunkedUpload'
import type { StreamingUploader, ChunkUploadProgress } from '../lib/chunkedUpload'

interface VideoItem {
  id: string
  title: string
  status: string
  duration_seconds: number
  created_at: string
  created_by_name: string
  thumbnail_url?: string | null
  storage_key?: string
  metadata?: { public_url?: string; storage_key?: string }
}

export default function Studio() {
  const [screenEnabled, setScreenEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [micEnabled, setMicEnabled] = useState(true)
  const [activeTab, setActiveTab] = useState('record')
  const [bgSelectorOpen, setBgSelectorOpen] = useState(false)
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null)
  // Ref al <video> real de la camara (visible en el preview) para PiP
  const activeCameraVideoRef = useRef<HTMLVideoElement | null>(null)
  const { processedStream, isModelReady, background, changeBackground, startBackgroundRemoval } = useBackgroundRemoval()
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  // Progreso real del chunked upload (chunks y bytes confirmados por el backend)
  const [uploadProgress, setUploadProgress] = useState<ChunkUploadProgress | null>(null)
  // Mensaje de error REAL (antes el catch lo tragaba y solo decía "Error al subir")
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Uploader en streaming: vive mientras dura la grabación
  const uploaderRef = useRef<StreamingUploader | null>(null)
  // Blob del último upload fallido (modo fallback) para poder reintentar
  const retryBlobRef = useRef<Blob | null>(null)
  const retryMetaRef = useRef<{ title: string; mimeType: string; filename: string } | null>(null)
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null)
  const navigate = useNavigate()
  useEscapeKey(!!selectedVideo, () => setSelectedVideo(null))

  const { isRecording, isPaused, recordingTime, permissionError, screenStream, cameraStream, startRecording, stopRecording, togglePause } = useMediaRecorder({
    audioEnabled: micEnabled,
    cameraEnabled: cameraEnabled,
    // Fallback legacy (solo se invoca si no hay onChunk): blob completo en RAM
    onDataAvailable: (blob) => { handleUploadRecording(blob) },
    // Flujo principal: chunked upload en streaming mientras se graba
    onChunk: (chunk) => { handleRecordingChunk(chunk) },
    onRecordingStopped: () => { void finishStreamingUpload() },
    onError: (error) => {
      console.error('Recording error:', error)
      setUploadError(error.message)
      setUploadStatus('error')
    }
  })

  // recordingTime en un ref: los callbacks del recorder capturan closures viejos
  const recordingTimeRef = useRef(0)
  useEffect(() => { recordingTimeRef.current = recordingTime }, [recordingTime])

  // --- Camara flotante (Picture-in-Picture nativo del navegador) ---
  // Prioridad del stream: preview -> camara del recorder -> stream procesado (con background)
  const { isSupported: isPipSupported, isFirefox: isFirefoxBrowser, isPipActive, enterPip, exitPip } = usePictureInPicture(
    () => cameraPreviewStream || cameraStream || processedStream
  )

  const handleTogglePip = async () => {
    if (isPipActive) {
      await exitPip()
      return
    }
    const stream = cameraStream || cameraPreviewStream || processedStream
    if (stream) await enterPip(stream, activeCameraVideoRef.current)
  }

  // --- AUTO-PiP: al iniciar la grabación, la cámara flota
  // sobre TODAS las ventanas (terminal, apps) para que el usuario
  // se vea mientras hace el tutorial. ---
  useEffect(() => {
    // Auto-PiP al grabar: Chrome/Edge usan la API estandar,
    // Firefox abre la ventana externa (enterPip hace el fallback)
    if (isRecording && (isPipSupported || isFirefoxBrowser) && !isPipActive) {
      const stream = cameraStream || cameraPreviewStream
      if (stream) enterPip(stream, activeCameraVideoRef.current)
    }
  }, [isRecording, cameraStream, cameraPreviewStream, isPipSupported, isFirefoxBrowser, isPipActive, enterPip])

  // Auto-exit PiP al detener la grabacion (no dejar la camara flotando sin stream)
  const wasRecordingRef = useRef(false)
  useEffect(() => {
    if (wasRecordingRef.current && !isRecording && isPipActive) exitPip()
    wasRecordingRef.current = isRecording
  }, [isRecording, exitPip, isPipActive])

  // Auto-exit PiP al apagar la camara (setCameraEnabled(false))
  useEffect(() => {
    if (!cameraEnabled && isPipActive) exitPip()
  }, [cameraEnabled, isPipActive, exitPip])

  // Cleanup al desmontar el componente
  useEffect(() => () => { exitPip() }, [exitPip])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0')
  }

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins + ':' + secs.toString().padStart(2, '0')
  }

  const getVideoUrl = (video: VideoItem): string => {
    const key = video.storage_key || video.metadata?.storage_key
if (key) return mediaProxyUrl(key)
    return ''
  }

  const handleStartRecording = async () => {
    setUploadStatus('idle')
    setUploadError(null)
    setUploadProgress(null)
    retryBlobRef.current = null
    retryMetaRef.current = null
    // Descartar cualquier uploader previo (grabación abortada antes de tiempo)
    uploaderRef.current?.abort()
    uploaderRef.current = null
    let mode: RecordingMode = 'screen-camera'
    if (screenEnabled && !cameraEnabled) mode = 'screen'
    else if (!screenEnabled && cameraEnabled) mode = 'camera'

    // Determinar qué stream de cámara usar (con o sin background)
    let cameraStreamForRecording: MediaStream | null = null

    if (background.mode !== 'none') {
      try {
        // Si ya hay un processedStream del hook, usarlo directo
        if (processedStream) {
          cameraStreamForRecording = processedStream
        } else {
          // Obtener cámara fresh e iniciar background processing
          const cam = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
            audio: false
          })
          // startBackgroundRemoval retorna el stream procesado DIRECTAMENTE
          // (no esperamos al estado de React que puede no estar actualizado)
          const bgStream = await startBackgroundRemoval(cam)
          if (bgStream) {
            cameraStreamForRecording = bgStream
            setCameraPreviewStream(bgStream)
          }
        }
      } catch (e) {
        console.warn('[Studio] No se pudo obtener cámara con background:', e)
      }
    }

    await startRecording(mode, cameraStreamForRecording)
  }


  const getVideoDuration = (blob: Blob): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob)
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        const dur = video.duration
        URL.revokeObjectURL(url)
        video.remove()
        resolve(Math.round(dur))
      }
      video.onerror = () => {
        URL.revokeObjectURL(url)
        video.remove()
        resolve(0)
      }
      video.src = url
    })
  }

  // ---------------------------------------------------------------------------
  // CHUNKED UPLOAD — flujo principal (streaming mientras se graba)
  // ---------------------------------------------------------------------------

  /** Crea (una sola vez) el uploader de la sesión, usando el MIME real del chunk. */
  const ensureUploader = (firstChunk: Blob): StreamingUploader => {
    if (uploaderRef.current) return uploaderRef.current

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const meta = {
      filename: 'recording-' + timestamp + '.webm',
      mimeType: firstChunk.type || 'video/webm',
      title: 'Grabacion ' + new Date().toLocaleString(),
    }
    retryMetaRef.current = meta

    uploaderRef.current = createStreamingUploader({
      filename: meta.filename,
      mimeType: meta.mimeType,
      title: meta.title,
      onProgress: (p) => setUploadProgress(p),
    })
    setUploadStatus('uploading')
    setUploadError(null)
    console.log('[UPLOAD] 🚀 Sesion chunked:', uploaderRef.current.uploadId)
    return uploaderRef.current
  }

  /** Cada chunk del MediaRecorder (timeslice 5s) se encola y sube al vuelo. */
  const handleRecordingChunk = (chunk: Blob): void => {
    try {
      ensureUploader(chunk).push(chunk)
    } catch (err) {
      console.error('[UPLOAD] ❌ No se pudo encolar el chunk:', err)
      setUploadError(describeUploadError(err))
      setUploadStatus('error')
    }
  }

  /** Al detener la grabación: espera la cola y envía upload-complete. */
  const finishStreamingUpload = async (): Promise<void> => {
    const uploader = uploaderRef.current
    uploaderRef.current = null
    if (!uploader) {
      console.warn('[UPLOAD] ⚠️ Sin uploader activo al detener la grabación')
      return
    }

    // Duración real: en streaming no hay blob para medir, usamos el timer del
    // recorder (el backend recalcula con ffprobe; duration_seconds es fallback).
    const duration = recordingTimeRef.current
    setUploadStatus('uploading')
    try {
      console.log('[UPLOAD] 🏁 Cerrando subida chunked, duración:', duration, 's')
      const data = await uploader.finish(duration)
      console.log('[UPLOAD] ✅ Video creado:', data.video?.id, data.video?.status)
      setUploadStatus('success')
      setUploadError(null)
      setUploadProgress((p) => (p ? { ...p, percent: 100, done: true } : p))
      fetchVideos()
      setTimeout(() => { setUploadStatus('idle'); setUploadProgress(null) }, 4000)
    } catch (err) {
      const message = describeUploadError(err)
      console.error('[UPLOAD] ❌ Chunked upload falló:', message)
      setUploadError(message)
      setUploadStatus('error')
    }
  }

  // ---------------------------------------------------------------------------
  // FALLBACK — blob completo (modo legacy del hook): se parte en chunks de 8MB
  // y, si el backend no soporta chunked, cae al upload de archivo único.
  // ---------------------------------------------------------------------------

  const handleUploadRecording = async (blob: Blob) => {
    setUploadStatus('uploading')
    setUploadError(null)
    setUploadProgress(null)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const meta = {
      filename: 'recording-' + timestamp + '.webm',
      mimeType: blob.type || 'video/webm',
      title: 'Grabacion ' + new Date().toLocaleString(),
    }
    retryBlobRef.current = blob
    retryMetaRef.current = meta

    try {
      // Calcular duracion REAL desde el blob (el timer de React se desincroniza en background)
      const actualDuration = await getVideoDuration(blob)
      console.log('[UPLOAD] Duracion real:', actualDuration, 's | Timer decia:', recordingTime, 's')

      // 1) Intento: chunked upload (no manda 1 request gigante)
      try {
        const data = await uploadBlobInChunks(blob, {
          filename: meta.filename,
          mimeType: meta.mimeType,
          title: meta.title,
          durationSeconds: actualDuration,
          onProgress: (p) => setUploadProgress(p),
        })
        console.log('[UPLOAD] ✅ Chunked (blob) ok:', data.video?.id)
        setUploadStatus('success')
        fetchVideos()
        setTimeout(() => { setUploadStatus('idle'); setUploadProgress(null) }, 4000)
        return
      } catch (chunkErr) {
        console.warn('[UPLOAD] ⚠️ Chunked falló, probando upload único:', describeUploadError(chunkErr))
      }

      // 2) Fallback: endpoint legacy de archivo único (debe seguir funcionando)
      const formData = new FormData()
      formData.append("duration_seconds", String(actualDuration))
      formData.append("video", blob, meta.filename)
      formData.append('title', meta.title)
      // Upload sin timeout: los videos pueden pesar GBs
      await api.upload('/videos/upload', formData)
      setUploadStatus('success')
      setUploadProgress(null)
      fetchVideos()
      setTimeout(() => setUploadStatus('idle'), 3000)
    } catch (err) {
      const message = describeUploadError(err)
      console.error('[UPLOAD] ❌ Falló la subida:', message)
      setUploadError(message)
      setUploadStatus('error')
    }
  }

  /** Reintenta la subida fallida (solo posible cuando conservamos el blob). */
  const handleRetryUpload = async (): Promise<void> => {
    const blob = retryBlobRef.current
    if (!blob) {
      setUploadError('No se puede reintentar: la grabación se subió en streaming y los chunks ya no están en memoria. Vuelve a grabar.')
      return
    }
    console.log('[UPLOAD] ↻ Reintentando subida...')
    await handleUploadRecording(blob)
  }

  /** Descarta el error y vuelve al estado inicial. */
  const handleDismissUploadError = (): void => {
    setUploadStatus('idle')
    setUploadError(null)
    setUploadProgress(null)
    retryBlobRef.current = null
  }

  const fetchVideos = async () => {
    setLoadingVideos(true)
    try {
      const data = await api.get<ApiResponse<VideoItem[]>>('/videos')
      setVideos(data.data || [])
    } catch (error) { console.error('Error fetching videos:', error) }
    setLoadingVideos(false)
  }

  useEffect(() => { if (activeTab === 'library') fetchVideos() }, [activeTab])

  return (
    <div className="animate-fade-in space-y-6">
      {/* Video Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedVideo(null)}>
          <div className="bg-[var(--bg-card)] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-[var(--border-color)]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] truncate">{selectedVideo.title}</h3>
              <button onClick={() => setSelectedVideo(null)} className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <video controls autoPlay className="w-full rounded-lg bg-black aspect-video" src={getVideoUrl(selectedVideo)}>
                Tu navegador no soporta el elemento video.
              </video>
              <div className="mt-4 flex items-center gap-4 text-sm text-[var(--text-muted)]">
                <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Duracion: {formatDuration(selectedVideo.duration_seconds)}</span>
                <span className={cn('px-2 py-0.5 rounded text-xs font-medium', selectedVideo.status === 'ready' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400')}>
                  {selectedVideo.status === 'ready' ? 'Listo' : 'Procesando'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {permissionError && (
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-rose-300 dark:border-rose-500/30">
          <p className="text-rose-600 dark:text-rose-400">Error: {permissionError}</p>
        </div>
      )}

      {uploadStatus === 'uploading' && (
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-teal-200 dark:border-teal-500/20" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-teal-600 dark:border-teal-400 border-t-transparent rounded-full" aria-hidden="true" />
            <span className="text-teal-600 dark:text-teal-500">
              {uploadProgress && uploadProgress.totalChunks > 0
                ? `Subiendo chunk ${uploadProgress.uploadedChunks}/${uploadProgress.totalChunks} (${uploadProgress.percent}%)`
                : 'Subiendo video...'}
            </span>
            {uploadProgress && uploadProgress.uploadedBytes > 0 && (
              <span className="text-xs text-[var(--text-muted)] ml-auto tabular-nums">
                {(uploadProgress.uploadedBytes / (1024 * 1024)).toFixed(1)} MB
              </span>
            )}
          </div>
          {uploadProgress && uploadProgress.percent > 0 && (
            <div className="mt-3 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-300"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
          )}
        </div>
      )}
      
      {uploadStatus === 'success' && (
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-emerald-300 dark:border-emerald-500/30">
          <span className="text-emerald-600 dark:text-emerald-400">Video subido exitosamente!</span>
        </div>
      )}

      {uploadStatus === 'error' && (
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-rose-300 dark:border-rose-500/30" role="alert">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 min-w-0">
              <p className="text-rose-600 dark:text-rose-400 font-medium">Error al subir el video</p>
              {uploadError && (
                <p className="text-sm text-rose-600/80 dark:text-rose-400/80 mt-1 break-words">{uploadError}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { void handleRetryUpload() }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Reintentar
              </button>
              <button
                onClick={handleDismissUploadError}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
                aria-label="Cerrar mensaje de error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h1>Studio</h1>
          <p>Graba y comparte conocimiento</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
          <button onClick={() => setActiveTab('record')} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all', activeTab === 'record' ? 'bg-white text-gray-900 shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>
            Grabar
          </button>
          <button onClick={() => setActiveTab('library')} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all', activeTab === 'library' ? 'bg-white text-gray-900 shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>
            Biblioteca ({videos.length})
          </button>
        </div>
      </div>

      {activeTab === 'record' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-4">
            {/* Video Preview */}
            <div className="card overflow-hidden p-0">
              <div className="relative aspect-video bg-[var(--bg-secondary)] flex items-center justify-center">
                <ScreenPreview stream={screenStream} enabled={screenEnabled} className="absolute inset-0" />
                {cameraEnabled && (
                  <div className="absolute bottom-5 right-5 w-44 h-44 z-10">
                    <div className="w-full h-full rounded-full overflow-hidden border-[3px] border-white/30 shadow-2xl">
                      <CameraPreview stream={cameraPreviewStream || cameraStream} enabled={cameraEnabled} processedStream={processedStream} background={background} className="w-full h-full" onActiveVideo={(el) => { activeCameraVideoRef.current = el }} />
                    </div>
                  </div>
                )}
                {isRecording && (
                  <div className="absolute top-4 left-4 flex items-center gap-3 z-20">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-100 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30">
                      <Circle className="w-3 h-3 text-rose-600 dark:text-rose-400 fill-rose-600 dark:fill-rose-400 animate-pulse" />
                      <span className="text-sm font-mono text-rose-700 dark:text-rose-400">{formatTime(recordingTime)}</span>
                    </div>
                    {isPaused && <span className="badge badge-amber">Pausado</span>}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="p-4 border-t border-[var(--border-color)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => !isRecording && setScreenEnabled(!screenEnabled)} disabled={isRecording} className={cn('p-3 rounded-xl transition-all', screenEnabled ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 shadow-sm border border-teal-200 dark:border-teal-500/30' : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)]', isRecording && 'opacity-50 cursor-not-allowed')}>
                      <Monitor className="w-5 h-5" />
                    </button>
                    <button onClick={() => !isRecording && setCameraEnabled(!cameraEnabled)} disabled={isRecording} className={cn('p-3 rounded-xl transition-all', cameraEnabled ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30' : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)]', isRecording && 'opacity-50 cursor-not-allowed')}>
                      <Camera className="w-5 h-5" />
                    </button>
                    <button onClick={() => !isRecording && setMicEnabled(!micEnabled)} disabled={isRecording} className={cn('p-3 rounded-xl transition-all', micEnabled ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30' : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)]', isRecording && 'opacity-50 cursor-not-allowed')}>
                      {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    </button>
                    <button onClick={() => setBgSelectorOpen(true)}
                      className="p-3 rounded-xl transition-all bg-teal-50 text-teal-500 border border-teal-200 hover:bg-teal-100"
                      title="Fondo de camara">
                      <ImagePlus className="w-5 h-5" />
                    </button>
                    {(isPipSupported || isFirefoxBrowser) && cameraEnabled && (cameraPreviewStream || cameraStream) && (
                      <button onClick={handleTogglePip}
                        className={cn('p-3 rounded-xl transition-all border',
                          isPipActive
                            ? 'bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-500/30'
                            : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text)]')}
                        title="Cámara flotante (PiP)">
                        <PictureInPicture2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {!isRecording ? (
                      <button onClick={handleStartRecording} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-medium shadow-lg hover:shadow-xl transition-all hover:scale-105">
                        <Circle className="w-5 h-5 fill-current" />
                        Iniciar Grabacion
                      </button>
                    ) : (
                      <>
                        <button onClick={togglePause} className="p-3 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                          {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                        </button>
                        <button onClick={stopRecording} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium border border-[var(--border-color)]">
                          <Square className="w-5 h-5 fill-current" />
                          Detener
                        </button>
                      </>
                    )}
                  </div>

                  <button className="btn-secondary gap-2 py-3">
                    <Upload className="w-5 h-5" />
                    <span className="text-sm">Subir video</span>
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Tips Sidebar */}
          <div className="space-y-4">
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
                  <Film className="w-5 h-5 text-teal-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)] leading-tight">Consejos para<br/>tutoriales pro</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Haz que tu equipo aprenda mejor</p>
                </div>
              </div>
              <ul className="space-y-3.5">
                {[
                  { t: 'Explica el por que ademas del como', d: 'Contexto primero, detalle despues' },
                  { t: 'Usa nombres descriptivos', d: 'Facilita buscar y recordar' },
                  { t: 'Graba en ambiente silencioso', d: 'La calidad del audio importa' },
                  { t: 'Muestra el cursor y destaca clics', d: 'Guia visual en cada paso' },
                  { t: 'Agrega pausas naturales', d: 'Da tiempo para procesar' }
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{tip.t}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{tip.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'library' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Mis Videos</h2>
            <button onClick={fetchVideos} className="btn-ghost btn-icon">
              <RefreshCw className={cn('w-5 h-5', loadingVideos && 'animate-spin')} />
            </button>
          </div>

          {videos.length === 0 ? (
            <div className="empty-state">
              <Film className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No hay videos todavia</h3>
              <p className="text-[var(--text-muted)] mb-6">Graba tu primer tutorial para comenzar</p>
              <button onClick={() => setActiveTab('record')} className="btn-primary px-6 py-3">
                <span className="flex items-center gap-2">
                  <Circle className="w-5 h-5" />
                  Grabar Video
                </span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((video) => (
                <div key={video.id} onClick={() => navigate(`/video/${video.id}`)} className="card card-hover p-0 overflow-hidden cursor-pointer group">
                  <div className="h-40 bg-[var(--bg-card)] flex items-center justify-center relative overflow-hidden">
                    <img
                      src={video.thumbnail_url || '/logo-poster.png'}
                      alt={video.title || 'Wagner Solutions'}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="p-4 rounded-full bg-white/30 dark:bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-8 h-8 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-[var(--text-primary)] truncate group-hover:text-teal-600 dark:group-hover:text-teal-500 transition-colors">{video.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-[var(--text-muted)]">
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{formatDuration(video.duration_seconds)}</span>
                      <span className={cn('badge', video.status === 'ready' ? 'badge-emerald' : video.status === 'processing' ? 'badge-amber' : 'badge-rose')}>
                        {video.status === 'ready' ? 'Listo' : video.status === 'processing' ? 'Procesando' : video.status}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-2">{new Date(video.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <BackgroundSelector
        currentBackground={background}
       
        isModelReady={isModelReady}
        onSelect={(option) => {
          changeBackground(option)
          const streamToUse = cameraPreviewStream || cameraStream
          if (option.mode !== "none" && streamToUse) {
            startBackgroundRemoval(streamToUse)
          }
        }}
        onClose={() => setBgSelectorOpen(false)}
        isOpen={bgSelectorOpen}
      />
    </div>
  )
}
