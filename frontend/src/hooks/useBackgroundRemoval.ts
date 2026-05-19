import { useRef, useState, useEffect } from 'react'

export type BackgroundMode = 'none' | 'color' | 'matrix'

export interface BackgroundOption {
  mode: BackgroundMode
  color?: string
  label: string
}

export const BACKGROUND_COLORS = [
  { label: 'Matrix Rain', mode: 'matrix' as const, color: '#000000' },
  { label: 'Oscuro', mode: 'color' as const, color: '#09090b' },
  { label: 'Oficina', mode: 'color' as const, color: '#1e293b' },
  { label: 'Abstracto', mode: 'color' as const, color: '#1e1b4b' },
  { label: 'Naturaleza', mode: 'color' as const, color: '#052e16' },
  { label: 'Calido', mode: 'color' as const, color: '#451a03' },
  { label: 'Profesional', mode: 'color' as const, color: '#0f172a' },
  { label: 'Playa', mode: 'color' as const, color: '#0c4a6e' },
  { label: 'Blanco', mode: 'color' as const, color: '#f8fafc' },
]

const MATRIX_CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'

export function useBackgroundRemoval() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const animRef = useRef<number>(0)
  const bgRef = useRef<BackgroundOption>({ mode: 'none', label: 'Sin fondo' })
  const matrixRef = useRef<{ x: number; y: number; speed: number; chars: string[] }[]>([])
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null)
  const [isModelReady] = useState(true)
  const [background, setBackground] = useState<BackgroundOption>({ mode: 'none', label: 'Sin fondo' })

  const initMatrix = (w: number, h: number) => {
    const drops: { x: number; y: number; speed: number; chars: string[] }[] = []
    const cols = Math.floor(w / 14)
    for (let i = 0; i < cols; i++) {
      drops.push({
        x: i * 14, y: Math.random() * h, speed: 1 + Math.random() * 3,
        chars: Array(20).fill(0).map(() => MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)])
      })
    }
    matrixRef.current = drops
  }

  const drawMatrix = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
    ctx.fillRect(0, 0, w, h)
    if (matrixRef.current.length === 0) initMatrix(w, h)
    ctx.font = '14px monospace'
    matrixRef.current.forEach((drop) => {
      const char = drop.chars[Math.floor(Math.random() * drop.chars.length)]
      ctx.fillStyle = '#00ff41'
      ctx.fillText(char, drop.x, drop.y)
      drop.y += drop.speed
      if (drop.y > h) { drop.y = 0; drop.speed = 1 + Math.random() * 3 }
    })
  }

  const processFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) {
      animRef.current = requestAnimationFrame(processFrame)
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) { animRef.current = requestAnimationFrame(processFrame); return }
    const bg = bgRef.current, w = canvas.width, h = canvas.height

    if (bg.mode === 'none') {
      ctx.drawImage(video, 0, 0, w, h)
    } else {
      if (bg.mode === 'matrix') {
        drawMatrix(ctx, w, h)
      }
      ctx.drawImage(video, 0, 0, w, h)
      const imgData = ctx.getImageData(0, 0, w, h)
      const d = imgData.data
      const colR = parseInt(bg.color?.slice(1,3) || '00', 16)
      const colG = bg.mode === 'matrix' ? 0 : parseInt(bg.color?.slice(3,5) || '00', 16)
      const colB = parseInt(bg.color?.slice(5,7) || '00', 16)
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2]
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        const isSkin = r > 80 && g > 40 && b > 20 && (max - min) > 15 && r > g && r > b
        if (!isSkin) {
          if (bg.mode === 'matrix') {
            d[i] = 0; d[i+1] = 0; d[i+2] = 0; d[i+3] = 0
          } else {
            d[i] = colR; d[i+1] = colG; d[i+2] = colB
          }
        }
      }
      ctx.putImageData(imgData, 0, 0)
    }
    animRef.current = requestAnimationFrame(processFrame)
  }

  const startBackgroundRemoval = async (cameraStream: MediaStream) => {
    if (!cameraStream) return null
    const video = document.createElement('video')
    video.srcObject = cameraStream; video.muted = true; video.playsInline = true; video.autoplay = true
    videoRef.current = video
    const canvas = document.createElement('canvas')
    canvas.width = 640; canvas.height = 480
    canvas.style.position = 'fixed'; canvas.style.top = '-9999px'; canvas.style.left = '-9999px'
    document.body.appendChild(canvas); canvasRef.current = canvas
    matrixRef.current = []
    await video.play()
    const stream = canvas.captureStream(30)
    setProcessedStream(stream)
    if (animRef.current) cancelAnimationFrame(animRef.current)
    animRef.current = requestAnimationFrame(processFrame)
    return stream
  }

  const changeBackground = (option: BackgroundOption) => { bgRef.current = option; setBackground(option) }

  const cleanup = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (canvasRef.current?.parentNode) canvasRef.current.parentNode.removeChild(canvasRef.current)
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null }
    canvasRef.current = null; videoRef.current = null; setProcessedStream(null)
  }

  useEffect(() => () => cleanup(), [])

  return {
    processedStream, isModelReady, background,
    changeBackground, startBackgroundRemoval, cleanup,
    BACKGROUND_COLORS,
  }
}
