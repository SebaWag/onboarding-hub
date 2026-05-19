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
      <div className={`bg-surface-900 flex items-center justify-center ${className}`}>
        <div className="text-center">
          <Monitor className="w-16 h-16 text-surface-600 mx-auto mb-4" />
          <p className="text-surface-400">Vista previa de pantalla</p>
          <p className="text-xs text-surface-500 mt-1">Haz clic en Iniciar Grabación para comenzar</p>
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
