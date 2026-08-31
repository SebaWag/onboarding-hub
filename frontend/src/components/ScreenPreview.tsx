import { useEffect, useRef } from 'react'
import { Monitor } from 'lucide-react'

interface ScreenPreviewProps {
  stream: MediaStream | null
  enabled: boolean
  className?: string
}

export default function ScreenPreview({ stream, enabled, className = '' }: ScreenPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  if (!enabled || !stream) {
    return (
      <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
        <img
          src="/studio-preview-cyberpunk.png"
          alt="Vista previa de pantalla"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 text-center px-4">
          <Monitor className="w-12 h-12 text-white/80 mx-auto mb-3 drop-shadow-lg" />
          <p className="text-white/95 font-medium text-sm">Vista previa de pantalla</p>
          <p className="text-white/60 text-xs mt-1">Haz clic en Iniciar Grabación para comenzar</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative bg-surface-950 ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
      />
    </div>
  )
}
