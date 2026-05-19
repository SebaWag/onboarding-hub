import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, MicOff, Monitor, Camera, Circle, Square, Pause, Play, Sparkles, Upload, ChevronRight, Wand2, Film, Clock, RefreshCw, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import type { RecordingMode } from '../hooks/useMediaRecorder'
import CameraPreview from '../components/CameraPreview'
import ScreenPreview from '../components/ScreenPreview'
import { useBackgroundRemoval } from "../hooks/useBackgroundRemoval"
import BackgroundSelector from "../components/BackgroundSelector"
import { ImagePlus } from "lucide-react"

interface VideoItem {
  id: string
  title: string
  status: string
  duration_seconds: number
  created_at: string
  created_by_name: string
  storage_key?: string
  metadata?: { public_url?: string; storage_key?: string }
}

export default function Studio() {
  const [screenEnabled, setScreenEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [micEnabled, setMicEnabled] = useState(true)
  const [activeTab, setActiveTab] = useState('record')
  const [bgSelectorOpen, setBgSelectorOpen] = useState(false)
  const [previewCameraStream, setPreviewCameraStream] = useState<MediaStream | null>(null); void setPreviewCameraStream
  const { processedStream, isModelReady, background, changeBackground, startBackgroundRemoval } = useBackgroundRemoval()
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null)
  const navigate = useNavigate()

  const { isRecording, isPaused, recordingTime, permissionError, screenStream, cameraStream, startRecording, stopRecording, togglePause } = useMediaRecorder({
    audioEnabled: micEnabled,
    cameraEnabled: cameraEnabled,
    onDataAvailable: (blob) => { handleUploadRecording(blob) },
    onError: (error) => { console.error('Recording error:', error) }
  })

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
    if (key) return '/api/storage/' + key
    return ''
  }

  const handleStartRecording = async () => {
    setUploadStatus('idle')
    let mode: RecordingMode = 'screen-camera'
    if (screenEnabled && !cameraEnabled) mode = 'screen'
    else if (!screenEnabled && cameraEnabled) mode = 'camera'
    await startRecording(mode)
  }

  const handleUploadRecording = async (blob: Blob) => {
    setUploadStatus('uploading')
    try {
      const formData = new FormData()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      formData.append('video', blob, 'recording-' + timestamp + '.webm')
      formData.append('title', 'Grabacion ' + new Date().toLocaleString())
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/videos/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
      })
      if (response.ok) {
        setUploadStatus('success')
        fetchVideos()
        setTimeout(() => setUploadStatus('idle'), 3000)
      } else {
        setUploadStatus('error')
      }
    } catch (error) {
      setUploadStatus('error')
    }
  }

  const fetchVideos = async () => {
    setLoadingVideos(true)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/videos', { headers: { 'Authorization': 'Bearer ' + token } })
      if (response.ok) {
        const data = await response.json()
        setVideos(data.data || [])
      }
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
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-teal-200 dark:border-teal-200">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-violet-600 dark:border-violet-400 border-t-transparent rounded-full" />
            <span className="text-teal-600 dark:text-teal-500">Subiendo video...</span>
          </div>
        </div>
      )}
      
      {uploadStatus === 'success' && (
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-emerald-300 dark:border-emerald-500/30">
          <span className="text-emerald-600 dark:text-emerald-400">Video subido exitosamente!</span>
        </div>
      )}

      {uploadStatus === 'error' && (
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-rose-300 dark:border-rose-500/30">
          <span className="text-rose-600 dark:text-rose-400">Error al subir el video</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Studio</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Graba y comparte conocimiento</p>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Video Preview */}
            <div className="bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-[var(--border-color)] shadow-sm">
              <div className="relative aspect-video bg-[var(--bg-secondary)] flex items-center justify-center">
                <ScreenPreview stream={screenStream} enabled={screenEnabled} className="absolute inset-0" />
                {cameraEnabled && (
                  <div className="absolute bottom-4 right-4 w-28 h-28 z-10">
                    <div className="w-full h-full rounded-full overflow-hidden border-[3px] border-white/30 shadow-2xl">
                      <CameraPreview stream={previewCameraStream || cameraStream} enabled={cameraEnabled} processedStream={processedStream} background={background} isBgReady={isModelReady} className="w-full h-full" />
                    </div>
                  </div>
                )}
                {isRecording && (
                  <div className="absolute top-4 left-4 flex items-center gap-3 z-20">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-100 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30">
                      <Circle className="w-3 h-3 text-rose-600 dark:text-rose-400 fill-rose-600 dark:fill-rose-400 animate-pulse" />
                      <span className="text-sm font-mono text-rose-700 dark:text-rose-400">{formatTime(recordingTime)}</span>
                    </div>
                    {isPaused && <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium">Pausado</span>}
                  </div>
                )}
                <div className="absolute top-4 right-4 z-20">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 dark:bg-teal-50 border border-teal-200 dark:border-teal-200 text-teal-700 dark:text-teal-500">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-xs font-medium">MiMo asistiendo</span>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="p-4 border-t border-[var(--border-color)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => !isRecording && setScreenEnabled(!screenEnabled)} disabled={isRecording} className={cn('p-3 rounded-xl transition-all', screenEnabled ? 'bg-teal-50 dark:bg-white text-gray-900 shadow-sm border border-teal-200 dark:border-teal-200' : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)]', isRecording && 'opacity-50 cursor-not-allowed')}>
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

                  <button className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-color)]">
                    <Upload className="w-5 h-5" />
                    <span className="text-sm">Subir video</span>
                  </button>
                </div>
              </div>
            </div>

            {/* AI Features Card */}
            <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-teal-200 dark:border-violet-500/20 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-lg">
                  <Wand2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[var(--text-primary)]">IA Integrada con MiMo</h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">Mientras grabas, MiMo analiza tu pantalla en tiempo real.</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="px-2 py-1 rounded bg-teal-50 dark:bg-teal-50 text-teal-700 dark:text-teal-500 text-xs font-medium">Transcripcion automatica</span>
                    <span className="px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium">Capitulos inteligentes</span>
                    <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-medium">Q&A conversacional</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tips Sidebar */}
          <div className="space-y-4">
            <div className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border-color)] shadow-sm">
              <h3 className="font-medium text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                Tips para buenos tutoriales
              </h3>
              <ul className="space-y-3">
                {['Explica el por que ademas del como', 'Usa nombres descriptivos', 'Graba en ambiente silencioso', 'Muestra el cursor y destaca clics', 'Agrega pausas naturales'].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                    <ChevronRight className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                    {tip}
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
            <button onClick={fetchVideos} className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text)]">
              <RefreshCw className={cn('w-5 h-5', loadingVideos && 'animate-spin')} />
            </button>
          </div>

          {videos.length === 0 ? (
            <div className="bg-[var(--bg-card)] rounded-2xl p-12 text-center border border-[var(--border-color)] shadow-sm">
              <Film className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No hay videos todavia</h3>
              <p className="text-[var(--text-muted)] mb-6">Graba tu primer tutorial para comenzar</p>
              <button onClick={() => setActiveTab('record')} className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md hover:shadow-lg">
                <span className="flex items-center gap-2">
                  <Circle className="w-5 h-5" />
                  Grabar Video
                </span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((video) => (
                <div key={video.id} onClick={() => navigate(`/video/${video.id}`)} className="bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-[var(--border-color)] hover:border-teal-400/50 hover:shadow-lg transition-all cursor-pointer group shadow-sm">
                  <div className="h-40 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center relative">
                    <Film className="w-12 h-12 text-violet-500 group-hover:scale-110 transition-transform" />
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
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', video.status === 'ready' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : video.status === 'processing' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' : 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400')}>
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
          const streamToUse = previewCameraStream || cameraStream
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
