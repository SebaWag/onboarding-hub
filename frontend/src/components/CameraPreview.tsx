import { useEffect, useRef } from 'react'
import { Camera, VideoOff, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

interface CameraPreviewProps {
  stream: MediaStream | null
  enabled: boolean
  className?: string
  processedStream?: MediaStream | null
  background?: { mode: string; label: string; color?: string; imageUrl?: string } | null
  isBgReady?: boolean
  isModelLoading?: boolean
}

export default function CameraPreview({
  stream, enabled, className = '',
  processedStream, background, isBgReady, isModelLoading,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const processedVideoRef = useRef<HTMLVideoElement>(null)
  const hasBgEffect = background && background.mode !== 'none'
  const showProcessed = hasBgEffect && processedStream && isBgReady

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
    return <div className={cn('bg-slate-800 rounded-xl flex items-center justify-center', className)}>
      <VideoOff className="w-8 h-8 text-slate-600" />
    </div>
  }

  if (!stream) {
    return <div className={cn('bg-slate-800 rounded-xl flex items-center justify-center', className)}>
      <Camera className="w-8 h-8 text-slate-600" />
    </div>
  }

  const bgStyle = !showProcessed && background?.mode === 'color'
    ? { backgroundColor: background.color || '#09090b' }
    : {}

  return (
    <div className={cn('relative rounded-xl overflow-hidden bg-slate-900', className)} style={bgStyle}>
      <video ref={videoRef} autoPlay playsInline muted
        className={cn('w-full h-full object-cover transform scale-x-[-1]', showProcessed && 'hidden')}
      />
      {hasBgEffect && !showProcessed && background?.mode === 'blur' && (
        <div className="absolute inset-0 z-10"
          style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        />
      )}
      {hasBgEffect && !showProcessed && background?.mode === 'color' && (
        <div className="absolute inset-0 z-10"
          style={{ backgroundColor: background.color || '#09090b', opacity: 0.85 }}
        />
      )}
      {showProcessed && (
        <video ref={processedVideoRef} autoPlay playsInline muted
          className="w-full h-full object-cover transform scale-x-[-1]"
        />
      )}
      {hasBgEffect && isModelLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin mx-auto mb-2" />
            <p className="text-xs text-white/80">Cargando IA...</p>
          </div>
        </div>
      )}
      {hasBgEffect && !isModelLoading && (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-500/30 backdrop-blur-sm border border-violet-500/30">
          <Sparkles className="w-3 h-3 text-violet-300" />
          <span className="text-[10px] text-violet-200 font-medium">{background?.label}</span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] text-white/80 font-medium">Camara</span>
      </div>
    </div>
  )
}
