import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {Play, Sparkles, Send, Share2, ChevronRight, Bot, User, Loader2, FileText, List, MessageSquare, ArrowLeft, AlertCircle } from 'lucide-react'
import { cn, mediaProxyUrl } from '../lib/utils'
import { apiRequest, api, type RequestOptions } from '../lib/api'
import VideoPlayer from '../components/video/VideoPlayer'
import VideoMeta from '../components/video/VideoMeta'
import CommentsSection from '../components/video/CommentsSection'
import type { VideoData, ChatMessage, VideoComment, Chapter, TranscriptSegment } from '../components/video/video-types'

// ============ TYPES ============





// ============ API HELPERS ============

// Wrapper local delegado en el cliente central (mantiene firma historica)
const apiFetch = async (url: string, options: RequestInit = {}) => {
  const { method = 'GET', body, headers } = options
  const h = { ...(headers as Record<string, string> | undefined) }
  let parsedBody: unknown
  if (typeof body === 'string') {
    try { parsedBody = JSON.parse(body) } catch { parsedBody = body }
    if (!h['Content-Type']) h['Content-Type'] = 'application/json'
  } else if (body !== undefined) {
    parsedBody = body
  }
  // DEUDA (Grupo C): contrato historico del wrapper devuelve JSON crudo;
  // migrar sus call sites a api.* tipadas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return apiRequest<any>(url.replace(/^\/api/, ''), {
    method: method as RequestOptions['method'],
    body: parsedBody,
    headers: h,
  })
}

// ============ MAIN COMPONENT ============
export default function VideoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Video state
  const [video, setVideo] = useState<VideoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [streamUrl, setStreamUrl] = useState<string>('')

  // Player state
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const videoContainerRef = useRef<HTMLDivElement>(null)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Comments state
  const [comments, setComments] = useState<VideoComment[]>([])
  const [commentInput, setCommentInput] = useState('')
  const [commentTimestamp, setCommentTimestamp] = useState(true)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyInput, setReplyInput] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)

  // Tabs
  const [activeTab, setActiveTab] = useState<'chat' | 'chapters' | 'transcript' | 'comments'>('chat')

  // Transcription
  const [isTranscribing, setIsTranscribing] = useState(false)

  // Interactions state
  const [isLiked, setIsLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareCopied, setShareCopied] = useState(false)
  const [isGeneratingShare, setIsGeneratingShare] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  // ============ FETCH VIDEO ============
  useEffect(() => {
    if (!id) return
    const fetchVideo = async () => {
      setLoading(true)
      try {
        const videoRes = await apiFetch(`/api/videos/${id}/stream`)
        if (!videoRes.success) throw new Error(videoRes.error)

        const listRes = await apiFetch('/api/videos')
        const videoData = listRes.data?.find((v: { id?: string }) => v.id === id)

        if (videoData) {
          setVideo(videoData)
        }

        setStreamUrl(videoRes.data.stream_url)

        if (videoRes.data.chapters?.length > 0) {
          setVideo(prev => prev ? { ...prev, metadata: { ...prev.metadata, chapters: videoRes.data.chapters } } : prev)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error')
      } finally {
        setLoading(false)
      }
    }
    fetchVideo()
  }, [id])

  // ============ FETCH INTERACTIONS STATUS ============
  useEffect(() => {
    if (!id) return
    const fetchInteractions = async () => {
      try {
        const [likeRes, bmRes] = await Promise.all([
          apiFetch(`/api/videos/${id}/like`),
          apiFetch(`/api/videos/${id}/bookmark`),
        ])
        if (likeRes.success) {
          setIsLiked(likeRes.data.liked)
          setLikeCount(likeRes.data.count)
        }
        if (bmRes.success) {
          setIsBookmarked(bmRes.data.bookmarked)
        }
      } catch (err) {
        console.error('Error fetching interactions:', err)
      }
    }
    fetchInteractions()
  }, [id])

  // ============ FETCH COMMENTS ============
  const fetchComments = useCallback(async () => {
    if (!id) return
    setLoadingComments(true)
    try {
      const res = await apiFetch(`/api/videos/${id}/comments`)
      if (res.success) {
        setComments(res.data || [])
      }
    } catch (err) {
      console.error('Error loading comments:', err)
    } finally {
      setLoadingComments(false)
    }
  }, [id])

  useEffect(() => {
    if (activeTab === 'comments') fetchComments()
  }, [activeTab, fetchComments])

  // ============ INIT CHAT ============
  useEffect(() => {
    if (video) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: video.transcript
          ? `¡Hola! Soy MiMo, tu asistente para el tutorial **"${video.title}"**. He analizado la transcripción completa del video. Puedes preguntarme sobre cualquier paso, pedirme que te explique algo con más detalle, o que te indique en qué momento del video se menciona algo específico. ¿En qué puedo ayudarte?`
          : `¡Hola! Soy MiMo, tu asistente para el tutorial **"${video.title}"**. Este video aún no tiene transcripción, pero puedo intentar responder preguntas generales sobre el tema. Para mejores resultados, te recomiendo primero transcribir el video usando el botón de transcripción.`,
        timestamp: 0,
      }])
    }
  }, [video])

  // ============ SCROLL CHAT ============
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ============ VIDEO PLAYER CONTROLS ============
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

  const seekTo = (seconds: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = seconds
    setCurrentTime(seconds)
    if (!isPlaying) {
      videoRef.current.play()
      setIsPlaying(true)
    }
  }

  const skip = (seconds: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + seconds, duration))
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (videoRef.current) {
      videoRef.current.volume = val
      setIsMuted(val === 0)
    }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    seekTo(pct * duration)
  }

  // ============ FORMAT HELPERS ============
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const parseTimeToSeconds = (time: string): number => {
    const parts = time.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  // ============ TRANSCRIBE VIDEO ============
  const handleTranscribe = async () => {
    if (!id) return
    setIsTranscribing(true)
    try {
      const res = await apiFetch(`/api/videos/${id}/process`, { method: 'POST' })
      if (res.success) {
        setVideo(prev => prev ? {
          ...prev,
          transcript: res.data.transcript,
          transcript_segments: res.data.segments,
          status: 'ready',
          metadata: { ...prev.metadata, chapters: res.data.chapters }
        } : prev)
        setMessages(prev => [...prev, {
          id: 'transcription-done',
          role: 'assistant',
          content: `¡Transcripción completada! Se generaron ${res.data.segments?.length || 0} segmentos y ${res.data.chapters?.length || 0} capítulos. Ahora puedo responder preguntas detalladas sobre el contenido del video.`,
          timestamp: currentTime,
        }])
      } else {
        throw new Error(res.error)
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'error desconocido'
      setMessages(prev => [...prev, {
        id: 'transcription-error',
        role: 'assistant',
        content: `Error al transcribir: ${detail}. Verifica que el servicio Whisper esté activo.`,
        timestamp: currentTime,
      }])
    } finally {
      setIsTranscribing(false)
    }
  }

  // ============ CHAT WITH VIDEO ============
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || isChatLoading || !id) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput.trim(),
      timestamp: currentTime,
    }
    setMessages(prev => [...prev, userMsg])

    const loadingMsg: ChatMessage = {
      id: 'loading',
      role: 'assistant',
      content: '',
      timestamp: currentTime,
      isLoading: true,
    }
    setMessages(prev => [...prev, loadingMsg])

    setChatInput('')
    setIsChatLoading(true)

    try {
      const res = await apiFetch(`/api/videos/${id}/chat`, {
        method: 'POST',
        body: JSON.stringify({
          message: chatInput.trim(),
          conversation_id: conversationId,
          current_timestamp: currentTime,
        }),
      })

      setMessages(prev => prev.filter(m => m.id !== 'loading'))

      if (res.success) {
        const aiContent = res.data.response || res.data.message
        const videoRefMatch = aiContent?.match(/(\d+:\d+(?::\d+)?)/g)

        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: aiContent,
          timestamp: currentTime,
          videoRef: videoRefMatch?.[0] || null,
        }
        setMessages(prev => [...prev, assistantMsg])

        if (res.data.conversation_id) {
          setConversationId(res.data.conversation_id)
        }
      } else {
        throw new Error(res.error)
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== 'loading'))
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error al procesar tu pregunta: ${err instanceof Error ? err.message : 'error desconocido'}`,
        timestamp: currentTime,
      }])
    } finally {
      setIsChatLoading(false)
    }
  }

  // ============ COMMENTS ============
  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentInput.trim() || !id) return

    try {
      const res = await apiFetch(`/api/videos/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: commentInput.trim(),
          timestamp_seconds: commentTimestamp ? Math.floor(currentTime) : null,
          parent_id: null,
        }),
      })
      if (res.success) {
        setCommentInput('')
        fetchComments()
      }
    } catch (err) {
      console.error('Error posting comment:', err)
    }
  }

  const handleReplySubmit = async (parentId: string) => {
    if (!replyInput.trim() || !id) return
    try {
      const res = await apiFetch(`/api/videos/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: replyInput.trim(),
          timestamp_seconds: null,
          parent_id: parentId,
        }),
      })
      if (res.success) {
        setReplyInput('')
        setReplyingTo(null)
        fetchComments()
      }
    } catch (err) {
      console.error('Error posting reply:', err)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!id) return
    try {
      const res = await apiFetch(`/api/videos/${id}/comments/${commentId}`, { method: 'DELETE' })
      if (res.success) fetchComments()
    } catch (err) {
      console.error('Error deleting comment:', err)
    }
  }

  const handleResolveComment = async (commentId: string, resolved: boolean) => {
    if (!id) return
    try {
      const res = await apiFetch(`/api/videos/${id}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_resolved: resolved }),
      })
      if (res.success) fetchComments()
    } catch (err) {
      console.error('Error resolving comment:', err)
    }
  }

  // ============ LIKE HANDLER ============
  const handleLike = async () => {
    if (!id) return
    try {
      const res = await apiFetch(`/api/videos/${id}/like`, { method: 'POST' })
      if (res.success) {
        setIsLiked(res.data.liked)
        setLikeCount(res.data.count)
      }
    } catch (err) {
      console.error('Error toggling like:', err)
    }
  }

  // ============ BOOKMARK HANDLER ============
  const handleBookmark = async () => {
    if (!id) return
    try {
      const res = await apiFetch(`/api/videos/${id}/bookmark`, { method: 'POST' })
      if (res.success) {
        setIsBookmarked(res.data.bookmarked)
      }
    } catch (err) {
      console.error('Error toggling bookmark:', err)
    }
  }

  // ============ SHARE HANDLER ============
  const handleShare = async () => {
    setIsShareModalOpen(true)
    if (shareUrl) return

    setIsGeneratingShare(true)
    try {
      const res = await apiFetch(`/api/videos/${id}/share`, {
        method: 'POST',
        body: JSON.stringify({ expires_in_hours: 72 }),
      })
      if (res.success) {
        setShareUrl(res.data.share_url)
      }
    } catch (err) {
      console.error('Error generating share link:', err)
    } finally {
      setIsGeneratingShare(false)
    }
  }

  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = shareUrl
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    }
  }

  // ============ DOWNLOAD HANDLER ============
  const handleDownload = async () => {
    if (!id || isDownloading) return
    setIsDownloading(true)
    try {
      const { blob, filename: serverFilename } = await api.download(`/videos/${id}/download`)
      const filename = serverFilename ?? (video?.title || 'video') + '.webm'

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading video:', err)
      alert('Error al descargar el video. Intenta de nuevo.')
    } finally {
      setIsDownloading(false)
    }
  }

  // ============ GET DATA ============
  const chapters: Chapter[] = (video?.metadata?.chapters as Chapter[] | undefined) ?? []
  const segments: TranscriptSegment[] = video?.transcript_segments || []
  const videoSrc = video?.storage_key ? mediaProxyUrl(video.storage_key) : streamUrl

  // ============ LOADING / ERROR ============
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-violet-500 animate-spin mx-auto mb-4" />
          <p className="text-surface-400">Cargando video...</p>
        </div>
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center glass rounded-2xl p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Error</h2>
          <p className="text-surface-400 mb-4">{error || 'Video no encontrado'}</p>
          <button onClick={() => navigate('/')} className="btn-primary">Volver al Studio</button>
        </div>
      </div>
    )
  }

  // ============ RENDER ============
  return (
    <div className="animate-fade-in">
      {/* Back button */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-surface-400 hover:text-white mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Volver</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============ LEFT: VIDEO + INFO ============ */}
        <div className="lg:col-span-2 space-y-4">
          {/* Video Player */}
          <VideoPlayer
            videoRef={videoRef}
            videoContainerRef={videoContainerRef}
            videoSrc={videoSrc}
            isPlaying={isPlaying} setIsPlaying={setIsPlaying}
            currentTime={currentTime} setCurrentTime={setCurrentTime}
            duration={duration} setDuration={setDuration}
            volume={volume} isMuted={isMuted} isFullscreen={isFullscreen}
            chapters={chapters} togglePlay={togglePlay} skip={skip}
            toggleMute={toggleMute} handleVolumeChange={handleVolumeChange}
            toggleFullscreen={toggleFullscreen} handleProgressClick={handleProgressClick}
          />
          {/* Video Info */}
          <VideoMeta
            video={video!} duration={duration}
            isTranscribing={isTranscribing} onTranscribe={handleTranscribe}
            isLiked={isLiked} likeCount={likeCount} onLike={handleLike}
            isBookmarked={isBookmarked} onBookmark={handleBookmark}
            onShare={handleShare} isDownloading={isDownloading} onDownload={handleDownload}
          />
        </div>

        {/* ============ RIGHT: TABS PANEL ============ */}
        <div className="glass rounded-2xl overflow-hidden noise-overlay flex flex-col h-[calc(100vh-200px)]">
          {/* Tab headers */}
          <div className="flex border-b border-white/5">
            {([
              { id: 'chat' as const, label: 'Chat IA', icon: Sparkles },
              { id: 'chapters' as const, label: 'Capítulos', icon: List },
              { id: 'transcript' as const, label: 'Texto', icon: FileText },
              { id: 'comments' as const, label: 'Notas', icon: MessageSquare },
            ]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors',
                  activeTab === tab.id ? 'text-teal-500 border-b-2 border-violet-500' : 'text-surface-400 hover:text-white'
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* ============ TAB: CHAT ============ */}
          {activeTab === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className={cn('flex gap-3', message.role === 'user' ? 'flex-row-reverse' : '')}>
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      message.role === 'user' ? 'bg-gradient-to-br from-emerald-500 to-teal-500' : 'bg-gradient-to-br from-teal-500 to-cyan-500'
                    )}>
                      {message.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                    </div>
                    <div className={cn(
                      'max-w-[85%] rounded-xl p-3',
                      message.role === 'user' ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-white/[0.03] border border-white/5'
                    )}>
                      {message.isLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />
                          <span className="text-sm text-surface-400">Analizando video...</span>
                        </div>
                      ) : (
                        <>
                          <div className="prose prose-invert prose-sm max-w-none text-sm">
                            <div dangerouslySetInnerHTML={{
                              __html: message.content
                                .replace(/\*\*(.*?)\*\*/g, '<strong class="text-teal-500">$1</strong>')
                                .replace(/\n\n/g, '<br/><br/>')
                                .replace(/\n/g, '<br/>')
                            }} />
                          </div>
                          {message.videoRef && (
                            <button
                              onClick={() => seekTo(parseTimeToSeconds(message.videoRef!))}
                              className="mt-2 flex items-center gap-1.5 text-xs text-teal-500 hover:text-violet-300 transition-colors"
                            >
                              <Play className="w-3 h-3" />
                              Ir a {message.videoRef}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat input */}
              <div className="p-4 border-t border-white/5">
                <form onSubmit={handleChatSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Pregunta sobre este tutorial..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/8 text-white text-sm placeholder-surface-500 focus:outline-none focus:border-teal-400/50"
                    disabled={isChatLoading}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className={cn(
                      'p-2.5 rounded-xl transition-all',
                      chatInput.trim() && !isChatLoading ? 'bg-violet-500 text-white' : 'bg-white/5 text-surface-500'
                    )}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
                <p className="text-[10px] text-surface-500 mt-1.5 text-center">
                  {video.transcript ? 'Chat contextual basado en la transcripción del video' : 'Transcribe el video para respuestas más precisas'}
                </p>
              </div>
            </>
          )}

          {/* ============ TAB: CHAPTERS ============ */}
          {activeTab === 'chapters' && (
            <div className="flex-1 overflow-y-auto p-4">
              {chapters.length > 0 ? (
                <div className="space-y-2">
                  {chapters.map((chapter, i) => {
                    const chapterSec = parseTimeToSeconds(chapter.time)
                    const isActive = currentTime >= chapterSec && (i === chapters.length - 1 || currentTime < parseTimeToSeconds(chapters[i + 1].time))
                    return (
                      <button
                        key={i}
                        onClick={() => seekTo(chapterSec)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left group',
                          isActive ? 'bg-violet-500/10 border border-violet-500/20' : 'hover:bg-white/5'
                        )}
                      >
                        <div className={cn(
                          'w-12 h-8 rounded-lg flex items-center justify-center text-xs font-mono transition-colors',
                          isActive ? 'bg-teal-50 text-teal-500' : 'bg-surface-800 text-surface-400 group-hover:bg-teal-50 group-hover:text-teal-500'
                        )}>
                          {chapter.time}
                        </div>
                        <div className="flex-1">
                          <p className={cn('text-sm font-medium', isActive ? 'text-teal-500' : 'text-white')}>{chapter.title}</p>
                          {chapter.duration && <p className="text-xs text-surface-500">{chapter.duration}</p>}
                        </div>
                        <ChevronRight className={cn('w-4 h-4 transition-colors', isActive ? 'text-teal-500' : 'text-surface-600 group-hover:text-teal-500')} />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <List className="w-10 h-10 text-surface-600 mx-auto mb-3" />
                  <p className="text-surface-400 text-sm">No hay capítulos disponibles</p>
                  <p className="text-surface-500 text-xs mt-1">Transcribe el video para generar capítulos automáticos</p>
                </div>
              )}
            </div>
          )}

          {/* ============ TAB: TRANSCRIPT ============ */}
          {activeTab === 'transcript' && (
            <div className="flex-1 overflow-y-auto p-4">
              {segments.length > 0 ? (
                <div className="space-y-3 text-sm">
                  {segments.map((segment, i) => {
                    const isActive = currentTime >= segment.start && currentTime < segment.end
                    return (
                      <div key={i} className={cn('group rounded-lg p-2 -mx-2 transition-colors', isActive ? 'bg-violet-500/10' : 'hover:bg-white/5')}>
                        <button
                          onClick={() => seekTo(segment.start)}
                          className={cn('font-mono text-xs transition-colors', isActive ? 'text-teal-500' : 'text-violet-500 hover:text-violet-300')}
                        >
                          {formatTime(segment.start)}
                        </button>
                        <p className={cn('mt-1 transition-colors', isActive ? 'text-white' : 'text-surface-300 group-hover:text-white')}>
                          {segment.text}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : video?.transcript ? (
                <div className="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap">
                  {video.transcript}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileText className="w-10 h-10 text-surface-600 mx-auto mb-3" />
                  <p className="text-surface-400 text-sm">No hay transcripción disponible</p>
                  <button onClick={handleTranscribe} disabled={isTranscribing} className="mt-3 px-4 py-2 rounded-xl bg-teal-50 text-teal-500 text-sm hover:bg-violet-500/30 transition-colors disabled:opacity-50">
                    {isTranscribing ? 'Transcribiendo...' : 'Transcribir ahora'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============ TAB: COMMENTS ============ */}
          {activeTab === 'comments' && (
            <CommentsSection
              comments={comments} loadingComments={loadingComments} seekTo={seekTo}
              replyingTo={replyingTo} setReplyingTo={setReplyingTo}
              replyInput={replyInput} setReplyInput={setReplyInput}
              onResolveComment={handleResolveComment} onDeleteComment={handleDeleteComment}
              commentInput={commentInput} setCommentInput={setCommentInput}
              commentTimestamp={commentTimestamp} setCommentTimestamp={setCommentTimestamp}
              currentTime={currentTime} onSubmitComment={handleCommentSubmit}
              onReplySubmit={(parentId) => handleReplySubmit(parentId)}
            />
          )}
        </div>

            {/* ============ SHARE MODAL ============ */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsShareModalOpen(false)}>
          <div className="glass rounded-2xl p-6 max-w-md w-full noise-overlay" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-teal-500" />
              Compartir Tutorial
            </h3>

            {isGeneratingShare ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 text-teal-500 animate-spin mx-auto mb-3" />
                <p className="text-surface-400 text-sm">Generando enlace...</p>
              </div>
            ) : shareUrl ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-surface-400 mb-1 block">Enlace para compartir</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm font-mono truncate"
                    />
                    <button
                      onClick={handleCopyShareUrl}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                        shareCopied
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-violet-500 text-white hover:bg-violet-600"
                      )}
                    >
                      {shareCopied ? '¡Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-surface-500">Este enlace expira en 72 horas. Cualquier persona con el enlace podrá ver el video y chatear con MiMo.</p>
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="w-full py-2 rounded-lg bg-white/5 text-surface-300 hover:text-white hover:bg-white/10 transition-colors text-sm"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-surface-400 text-sm">Error al generar el enlace. Intenta de nuevo.</p>
                <button onClick={handleShare} className="mt-3 px-4 py-2 rounded-lg bg-violet-500 text-white text-sm">
                  Reintentar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      </div>
    </div>
  )
}
