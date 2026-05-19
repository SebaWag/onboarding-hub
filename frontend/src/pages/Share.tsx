import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Play, Pause, Lock, Clock, Eye, Sparkles, Send, Bot, User, Loader2,
  Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward
} from 'lucide-react'
import { cn } from '../lib/utils'

interface VideoData {
  id: string
  title: string
  description: string
  duration: number
  transcript: string
  thumbnail_url: string
  stream_url: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function Share() {
  const { token } = useParams()
  const [video, setVideo] = useState<VideoData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requiresPassword, setRequiresPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)

  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    fetchVideo()
  }, [token])

  const fetchVideo = async (pwd?: string) => {
    try {
      setIsLoading(true)
      const url = pwd ? `/api/videos/share/${token}?password=${pwd}` : `/api/videos/share/${token}`
      const response = await fetch(url)
      const data = await response.json()
      if (!response.ok) {
        if (data.requires_password) {
          setRequiresPassword(true)
        } else {
          setError(data.error || 'Error al cargar video')
        }
        return
      }
      setVideo(data.data.video)
      setRequiresPassword(false)
      setMessages([{
        id: '1',
        role: 'assistant',
        content: `Hola! Soy MiMo, tu asistente para este tutorial sobre "${data.data.video.title}". Puedes preguntarme cualquier cosa sobre el contenido del video. En que puedo ayudarte?`,
      }])
    } catch (err) {
      setError('Error de conexion')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password.trim()) {
      fetchVideo(password)
    }
  }

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isChatLoading || !video) return
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input.trim() }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsChatLoading(true)
    try {
      const response = await fetch(`/api/videos/${video.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input.trim() }),
      })
      const data = await response.json()
      if (data.success) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.data.response,
        }])
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu pregunta.',
      }])
    } finally {
      setIsChatLoading(false)
    }
  }

  // ============ VIDEO CONTROLS ============
  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return
    if (!isFullscreen) {
      videoContainerRef.current.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
    setIsFullscreen(!isFullscreen)
  }

  const skip = (seconds: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + seconds, duration))
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    if (videoRef.current) {
      videoRef.current.currentTime = pct * duration
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (videoRef.current) {
      videoRef.current.volume = val
      setIsMuted(val === 0)
    }
  }

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Construir URL del video a través del proxy
  const getVideoSrc = () => {
    if (!video) return ''
    // Si stream_url es una URL absoluta de SeaweedFS, extraer el storage_key y usar el proxy
    if (video.stream_url) {
      try {
        const url = new URL(video.stream_url)
        // Extraer path después del bucket name (ej: /onboarding-hub/videos/org/file.webm)
        const pathParts = url.pathname.split('/')
        // Remover el primer slash vacío y el bucket name
        const keyParts = pathParts.slice(2) // skip empty + bucket
        if (keyParts.length > 0) {
          return `/api/storage/${keyParts.join('/')}`
        }
      } catch {
        // Si no es URL válida, puede ser ya un path relativo
        if (video.stream_url.startsWith('/api/')) {
          return video.stream_url
        }
        return `/api/storage/${video.stream_url}`
      }
    }
    return ''
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-violet-500 animate-spin mx-auto mb-4" />
          <p className="text-surface-400">Cargando video...</p>
        </div>
      </div>
    )
  }

  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full noise-overlay">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-teal-500" />
            </div>
            <h2 className="text-xl font-bold text-white">Video Protegido</h2>
            <p className="text-surface-400 mt-2">Este video requiere contrasena para acceder</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ingresa la contrasena" className="input-field" autoFocus />
            <button type="submit" className="btn-primary w-full">Acceder al Video</button>
          </form>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full noise-overlay text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">:(</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Error</h2>
          <p className="text-surface-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!video) return null

  const videoSrc = getVideoSrc()

  return (
    <div className="min-h-screen bg-surface-950">
      <div className="max-w-7xl mx-auto p-4 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Video Player */}
            <div className="glass rounded-2xl overflow-hidden noise-overlay" ref={videoContainerRef}>
              <div className="relative aspect-video bg-surface-950">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="w-full h-full object-contain bg-black"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                  onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                  onEnded={() => setIsPlaying(false)}
                  onClick={togglePlay}
                  playsInline
                />

                {/* Play overlay */}
                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer" onClick={togglePlay}>
                    <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                      <Play className="w-8 h-8 text-white ml-1" />
                    </div>
                  </div>
                )}

                {/* AI badge */}
                <div className="absolute top-4 right-4">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 backdrop-blur-sm border border-violet-500/30">
                    <Sparkles className="w-4 h-4 text-teal-500" />
                    <span className="text-xs text-violet-300">Preguntale al video</span>
                  </div>
                </div>

                {/* Timestamp */}
                <div className="absolute top-4 left-4">
                  <div className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm">
                    <span className="text-xs font-mono text-white">{formatTime(currentTime)}</span>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="p-4 border-t border-white/5">
                {/* Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-surface-400 mb-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <div
                    className="h-1.5 bg-surface-800 rounded-full overflow-hidden cursor-pointer relative group/progress"
                    onClick={handleProgressClick}
                  >
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all relative"
                      style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => skip(-10)} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
                      <SkipBack className="w-5 h-5" />
                    </button>
                    <button onClick={togglePlay} className="p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors">
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <button onClick={() => skip(10)} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
                      <SkipForward className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 group/vol">
                      <button onClick={toggleMute} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
                        {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                      </button>
                      <input
                        type="range" min="0" max="1" step="0.05" value={volume}
                        onChange={handleVolumeChange}
                        className="w-20 h-1 accent-violet-500 opacity-0 group-hover/vol:opacity-100 transition-opacity"
                      />
                    </div>
                    <button onClick={toggleFullscreen} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
                      {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Video Info */}
            <div className="glass rounded-2xl p-6 noise-overlay">
              <h1 className="text-2xl font-bold text-white">{video.title}</h1>
              {video.description && <p className="text-surface-400 mt-2">{video.description}</p>}
              <div className="flex items-center gap-4 mt-4 text-sm text-surface-500">
                <div className="flex items-center gap-1"><Clock className="w-4 h-4" />{formatTime(duration || video.duration)}</div>
                <div className="flex items-center gap-1"><Eye className="w-4 h-4" />Tutorial</div>
              </div>
            </div>

            <div className="text-center text-sm text-surface-600">
              Creado con <span className="text-teal-500 font-medium">TutorialHub</span> by Konektor
            </div>
          </div>

          {/* Chat Panel */}
          <div className="glass rounded-2xl overflow-hidden noise-overlay flex flex-col h-[calc(100vh-200px)]">
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Chat con MiMo</h3>
                  <p className="text-xs text-surface-400">Pregunta sobre este tutorial</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={cn('flex gap-3', message.role === 'user' ? 'flex-row-reverse' : '')}>
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', message.role === 'user' ? 'bg-gradient-to-br from-emerald-500 to-teal-500' : 'bg-gradient-to-br from-teal-500 to-cyan-500')}>
                    {message.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                  </div>
                  <div className={cn('max-w-[85%] rounded-xl p-3', message.role === 'user' ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-white/[0.03] border border-white/5')}>
                    <p className="text-sm text-surface-200 whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                    <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 text-teal-500 animate-spin" /><span className="text-sm text-surface-400">Analizando...</span></div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-white/5">
              <form onSubmit={handleChatSubmit} className="flex gap-2">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pregunta sobre el tutorial..." className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/8 text-white text-sm placeholder-surface-500 focus:outline-none focus:border-teal-400/50" />
                <button type="submit" disabled={!input.trim() || isChatLoading} className={cn('p-2.5 rounded-xl transition-all', input.trim() && !isChatLoading ? 'bg-violet-500 text-white' : 'bg-white/5 text-surface-500')}>
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
