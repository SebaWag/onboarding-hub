import { useEffect, useRef } from 'react'
import { Camera, VideoOff, Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'

interface CameraPreviewProps {
  stream: MediaStream | null
  enabled: boolean
  className?: string
  processedStream?: MediaStream | null
  background?: { mode: string; label: string; color?: string; imageUrl?: string } | null
  isModelLoading?: boolean
}

export default function CameraPreview({
  stream, enabled, className = '',
  processedStream, background, isModelLoading,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const processedVideoRef = useRef<HTMLVideoElement>(null)
  const hasBgEffect = background && background.mode !== 'none'
  
  // Mostrar stream procesado SOLO si:
  // 1. Hay efecto de background activo
  // 2. Hay un processedStream disponible
  // 3. El modelo está listo (IA) o estamos en modo fallback
  const showProcessed = hasBgEffect && !!processedStream && !!processedStream.getVideoTracks().length

  useEffect(() => {
    if (videoRef.current && stream && !showProcessed) {
      videoRef.current.srcObject = stream
    }
  }, [stream, showProcessed])

  useEffect(() => {
    if (processedVideoRef.current && processedStream && showProcessed) {
      processedVideoRef.current.srcObject = processedStream
    }
  }, [processedStream, showProcessed])

  if (!enabled) {
    return (
      <div className={cn('bg-slate-800 rounded-xl flex items-center justify-center', className)}>
        <VideoOff className="w-8 h-8 text-slate-600" />
      </div>
    )
  }

  if (!stream) {
    return (
      <div className={cn('bg-slate-800 rounded-xl flex items-center justify-center', className)}>
        <Camera className="w-8 h-8 text-slate-600" />
      </div>
    )
  }

  return (
    <div className={cn('relative rounded-xl overflow-hidden bg-slate-900', className)}>
      {/* Video RAW (sin procesar) — visible cuando NO hay processedStream */}
      <video
        ref={videoRef}
        autoPlay playsInline muted
        className={cn(
          'w-full h-full object-cover transform scale-x-[-1]',
          showProcessed && 'hidden'
        )}
      />

      {/* Video PROCESADO (con background) — visible cuando SÍ hay processedStream */}
      {showProcessed && (
        <video
          ref={processedVideoRef}
          autoPlay playsInline muted
          className="w-full h-full object-cover transform scale-x-[-1]"
        />
      )}

      {/* Overlay mientras carga el modelo de IA */}
      {hasBgEffect && isModelLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto mb-2" />
            <p className="text-xs text-white/80">Cargando IA de segmentación...</p>
          </div>
        </div>
      )}

      {/* Badge: Efecto activo (con IA o fallback) */}
      {hasBgEffect && !isModelLoading && (
        <div className={cn(
          'absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-lg backdrop-blur-sm border',
          showProcessed
            ? 'bg-emerald-500/30 border-emerald-500/30'
            : 'bg-amber-500/30 border-amber-500/30'
        )}>
          {showProcessed ? (
            <Sparkles className="w-3 h-3 text-emerald-300" />
          ) : (
            <AlertTriangle className="w-3 h-3 text-amber-300" />
          )}
          <span className="text-[10px] font-medium" style={{ color: showProcessed ? '#6ee7b7' : '#fcd34d' }}>
            {showProcessed ? background?.label : `${background?.label} (preview)`}
          </span>
        </div>
      )}

      {/* Preview sin IA: mostrar el efecto como preview NO destructivo */}
      {hasBgEffect && !showProcessed && !isModelLoading && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          {/* Overlay sutíl para preview del color */}
          {background?.mode === 'color' && background?.color && (
            <div
              className="absolute inset-0 opacity-20"
              style={{ backgroundColor: background.color }}
            />
          )}
          {/* Overlay sutíl para preview de blur */}
          {background?.mode === 'blur' && (
            <div
              className="absolute inset-0"
              style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            />
          )}
          <div className="relative z-10 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-[10px] text-amber-300 font-medium">
            ⚡ El efecto se aplicará al grabar
          </div>
        </div>
      )}

      {/* Badge inferior: Indicador de cámara activa */}
      <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] text-white/80 font-medium">Cámara</span>
      </div>
    </div>
  )
}
