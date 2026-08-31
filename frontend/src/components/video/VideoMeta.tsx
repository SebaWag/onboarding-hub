import {
  Clock, Eye, ThumbsUp, Share2, Download, Bookmark, Loader2, Zap,
  CheckCircle2, AlertCircle,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatTime, type VideoData } from './video-types'

interface VideoMetaProps {
  video: VideoData
  duration: number
  isTranscribing: boolean
  onTranscribe: () => void
  isLiked: boolean
  likeCount: number
  onLike: () => void
  isBookmarked: boolean
  onBookmark: () => void
  onShare: () => void
  isDownloading: boolean
  onDownload: () => void
}

/** Titulo, descripcion, badges y acciones del video. */
export default function VideoMeta({
  video, duration,
  isTranscribing, onTranscribe: handleTranscribe,
  isLiked, likeCount, onLike: handleLike,
  isBookmarked, onBookmark: handleBookmark,
  onShare: handleShare, isDownloading, onDownload: handleDownload,
}: VideoMetaProps) {
  return (
    <>
          {/* Video Info */}
          <div className="glass rounded-2xl p-6 noise-overlay">
            <h1 className="text-xl font-bold text-white">{video.title}</h1>
            {video.description && <p className="text-surface-400 mt-2">{video.description}</p>}
            <div className="flex items-center gap-4 mt-3 text-sm text-surface-400">
              <div className="flex items-center gap-1"><Clock className="w-4 h-4" />{formatTime(duration || video.duration_seconds || 0)}</div>
              <div className="flex items-center gap-1"><Eye className="w-4 h-4" />Tutorial</div>
              <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-xs', video.transcript ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400')}>
                {video.transcript ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {video.transcript ? 'Transcrito' : 'Sin transcripción'}
              </div>
<span className="text-xs text-surface-500">{video.created_at ? new Date(video.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : null}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5 flex-wrap">
              {!video.transcript && (
                <button
                  onClick={handleTranscribe}
                  disabled={isTranscribing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-sm font-medium hover:shadow-glow transition-all disabled:opacity-50"
                >
                  {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {isTranscribing ? 'Transcribiendo...' : 'Transcribir con IA'}
                </button>
              )}
              <button
                onClick={handleLike}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl transition-colors text-sm",
                  isLiked
                    ? "bg-teal-50 text-teal-500 border border-teal-500/30"
                    : "bg-white/5 text-surface-300 hover:text-white hover:bg-white/10"
                )}
              >
                <ThumbsUp className={cn("w-4 h-4", isLiked && "fill-current")} />
                {likeCount > 0 ? `Útil (${likeCount})` : 'Útil'}
              </button>
              <button
                onClick={handleBookmark}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl transition-colors text-sm",
                  isBookmarked
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-white/5 text-surface-300 hover:text-white hover:bg-white/10"
                )}
              >
                <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-current")} />
                {isBookmarked ? 'Guardado' : 'Guardar'}
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-surface-300 hover:text-white hover:bg-white/10 transition-colors text-sm"
              >
                <Share2 className="w-4 h-4" />Compartir
              </button>
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-surface-300 hover:text-white hover:bg-white/10 transition-colors text-sm disabled:opacity-50"
              >
                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isDownloading ? 'Descargando...' : 'Descargar'}
              </button>
            </div>
          </div>
    </>
  )
}
