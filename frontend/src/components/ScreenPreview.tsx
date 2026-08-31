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
      <div className={`overflow-hidden ${className}`}>
        <img
          src="/studio-preview-cyberpunk.png"
          alt="Vista previa de pantalla"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center pb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm">
            <Monitor className="w-4 h-4 text-teal-300" />
            <p className="text-white/90 text-xs font-medium">Vista previa de pantalla</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-surface-950 ${className}`}>
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
