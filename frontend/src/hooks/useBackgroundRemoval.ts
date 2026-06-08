import { useRef, useState, useEffect, useCallback } from 'react'

export type BackgroundMode = 'none' | 'color' | 'image' | 'blur' | 'matrix'

export interface BackgroundOption {
  mode: BackgroundMode
  color?: string
  image?: string
  label: string
  thumbnail?: string
}

// --- Background Definitions ---
export const BACKGROUNDS: BackgroundOption[] = [
  { mode: 'none', label: 'Sin fondo', color: '#000000' },
  // Colores sólidos
  { mode: 'color', color: '#09090b', label: 'Oscuro' },
  { mode: 'color', color: '#1e293b', label: 'Oficina' },
  { mode: 'color', color: '#0f172a', label: 'Profesional' },
  { mode: 'color', color: '#451a03', label: 'Cálido' },
  { mode: 'color', color: '#0c4a6e', label: 'Playa' },
  { mode: 'color', color: '#f8fafc', label: 'Blanco' },
  // Imágenes reales
  { mode: 'image', image: '/backgrounds/office-traditional.jpg', label: 'Oficina Ejecutiva', thumbnail: '/backgrounds/office-traditional.jpg' },
  { mode: 'image', image: '/backgrounds/office-harvey.jpg', label: 'Harvey Specter', thumbnail: '/backgrounds/office-harvey.jpg' },
  { mode: 'image', image: '/backgrounds/office-futuristic.jpg', label: 'Oficina Futurista', thumbnail: '/backgrounds/office-futuristic.jpg' },
  { mode: 'image', image: '/backgrounds/office-library.jpg', label: 'Biblioteca', thumbnail: '/backgrounds/office-library.jpg' },
  // Efecto Matrix
  { mode: 'matrix', label: 'Matrix Rain' },
]

// Matrix effect characters
const MATRIX_CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'

export function useBackgroundRemoval() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const animRef = useRef<number>(0)
  const bgRef = useRef<BackgroundOption>({ mode: 'none', label: 'Sin fondo' })
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const segmenterRef = useRef<any>(null)
  const matrixDropsRef = useRef<{ x: number; y: number; speed: number }[]>([])
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null)
  const [isModelReady, setIsModelReady] = useState(false)
  const [background, setBackground] = useState<BackgroundOption>({ mode: 'none', label: 'Sin fondo' })
  const [modelLoading, setModelLoading] = useState(false)

  // Initialize MediaPipe Selfie Segmenter
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      setModelLoading(true)
      try {
        // Dynamic import of MediaPipe Tasks Vision
        const visionModule = await import('@mediapipe/tasks-vision')
        const SelfieSegmenter = (visionModule as any).SelfieSegmenter
        const { FilesetResolver } = await import(
          '@mediapipe/tasks-vision'
        )
        if (cancelled) return
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/'
        )
        if (cancelled) return
        segmenterRef.current = await SelfieSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-assets/selfie_segmentation_landscape.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
        })
        if (!cancelled) {
          setIsModelReady(true)
          setModelLoading(false)
        }
      } catch (err) {
        console.warn('MediaPipe no disponible, usando fallback:', err)
        setIsModelReady(false)
        setModelLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  // Matrix rain initializer
  const initMatrix = (w: number, h: number) => {
    const cols = Math.floor(w / 14)
    matrixDropsRef.current = Array.from({ length: cols }, (_, i) => ({
      x: i * 14, y: Math.random() * h, speed: 1 + Math.random() * 3,
    }))
  }

  // Draw matrix rain on canvas
  const drawMatrix = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
    ctx.fillRect(0, 0, w, h)
    if (matrixDropsRef.current.length === 0) initMatrix(w, h)
    ctx.font = '14px monospace'
    ctx.fillStyle = '#00ff41'
    matrixDropsRef.current.forEach((drop) => {
      const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
      ctx.fillText(char, drop.x, drop.y)
      drop.y += drop.speed
      if (drop.y > h + 20) { drop.y = -20; drop.speed = 1 + Math.random() * 3 }
    })
  }

  // Draw background image
  const drawBgImage = (ctx: CanvasRenderingContext2D, w: number, h: number, src: string) => {
    let img = bgImageRef.current
    if (!img || img.dataset.src !== src) {
      img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = src
      img.dataset.src = src
      bgImageRef.current = img
    }
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, w, h)
    } else {
      // Fallback color while image loads
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(0, 0, w, h)
    }
  }

  // Main frame processing loop
  const processFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) {
      animRef.current = requestAnimationFrame(processFrame)
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) { animRef.current = requestAnimationFrame(processFrame); return }

    const bg = bgRef.current
    const w = canvas.width
    const h = canvas.height
    const isActive = bg.mode !== 'none'

    if (!isActive) {
      // No background → direct video
      ctx.drawImage(video, 0, 0, w, h)
    } else if (bg.mode === 'matrix') {
      drawMatrix(ctx, w, h)
      ctx.drawImage(video, 0, 0, w, h)
    } else if (isModelReady && segmenterRef.current) {
      // === MediaPipe ML SEGMENTATION ===
      try {
        const result = segmenterRef.current.segment(video, { timestamp: Date.now() })
        const mask = result.categoryMask
            // imageData removed - mask applied differently
        const maskData = mask.getAsFloat32Array()
        // pixels = imageData.data

        // Draw background first
        if (bg.mode === 'image' && bg.image) {
          drawBgImage(ctx, w, h, bg.image)
        } else if (bg.color) {
          ctx.fillStyle = bg.color
          ctx.fillRect(0, 0, w, h)
        }

        // Composite video with mask
        const videoCanvas = document.createElement('canvas')
        videoCanvas.width = w
        videoCanvas.height = h
        const vCtx = videoCanvas.getContext('2d')!
        vCtx.drawImage(video, 0, 0, w, h)
        const videoData = vCtx.getImageData(0, 0, w, h).data

        const outputData = ctx.getImageData(0, 0, w, h)
        const out = outputData.data

        const threshold = 0.5
        for (let i = 0; i < maskData.length; i++) {
          const confidence = maskData[i]
          if (confidence < threshold) {
            // Person pixel → show video
            const idx = i * 4
            out[idx] = videoData[idx]
            out[idx + 1] = videoData[idx + 1]
            out[idx + 2] = videoData[idx + 2]
            out[idx + 3] = 255
          }
          // else → keep background (already drawn)
        }
        ctx.putImageData(outputData, 0, 0)
      } catch (err) {
        // Fallback: just show video
        ctx.drawImage(video, 0, 0, w, h)
      }
    } else {
      // === FALLBACK: COLOR-BASED DETECTION ===
      // 1. Draw background (image or color) FIRST
      if (bg.mode === 'image' && bg.image) {
        drawBgImage(ctx, w, h, bg.image)
      } else if (bg.color) {
        ctx.fillStyle = bg.color
        ctx.fillRect(0, 0, w, h)
      }
      
      // 2. SAVE background pixels BEFORE drawing video
      const bgPixels = ctx.getImageData(0, 0, w, h)
      const bgPixel = bgPixels.data
      
      // 3. Draw video on top
      ctx.drawImage(video, 0, 0, w, h)
      
      // 4. Get combined pixels (video on top of background)
      const combined = ctx.getImageData(0, 0, w, h)
      const d = combined.data
      
      // 5. For non-skin pixels, show background instead of video
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2]
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        const isSkin = r > 60 && g > 25 && b > 15 && (max) > 50 && r > g * 0.7 && r > b * 0.6 || (r > 30 && g > 20 && b > 15 && max > 80 && max - min > 20)
        if (!isSkin) {
          d[i] = bgPixel[i]; d[i+1] = bgPixel[i+1]; d[i+2] = bgPixel[i+2]; d[i+3] = 255
        }
      }
      ctx.putImageData(combined, 0, 0)
    }

    animRef.current = requestAnimationFrame(processFrame)
  }, [isModelReady])

  const startBackgroundRemoval = async (cameraStream: MediaStream) => {
    if (!cameraStream) return null

    const video = document.createElement('video')
    video.srcObject = cameraStream
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    videoRef.current = video

    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    canvas.style.position = 'fixed'
    canvas.style.top = '-9999px'
    canvas.style.left = '-9999px'
    document.body.appendChild(canvas)
    canvasRef.current = canvas

    matrixDropsRef.current = []
    await video.play()

    const stream = canvas.captureStream(30)
    setProcessedStream(stream)

    if (animRef.current) cancelAnimationFrame(animRef.current)
    animRef.current = requestAnimationFrame(processFrame)

    return stream
  }

  const changeBackground = (option: BackgroundOption) => {
    bgRef.current = option
    setBackground(option)
  }

  const cleanup = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (canvasRef.current?.parentNode) {
      canvasRef.current.parentNode.removeChild(canvasRef.current)
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    canvasRef.current = null
    videoRef.current = null
    setProcessedStream(null)
  }

  useEffect(() => () => cleanup(), [])

  return {
    processedStream,
    isModelReady,
    modelLoading,
    background,
    changeBackground,
    startBackgroundRemoval,
    cleanup,
    backgrounds: BACKGROUNDS,
  }
}
