import { useRef, useState, useEffect, useCallback } from 'react'
import type { ImageSegmenter } from '@mediapipe/tasks-vision'

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

/**
 * Detección de piel mejorada para fallback cuando MediaPipe no está disponible.
 * Usa un espacio de color YCrCb para mejor precisión en distintos tonos de piel.
 */
function isSkinPixel(r: number, g: number, b: number): boolean {
  // Criterio 1: Rango RGB básico (rápido)
  const basicCheck = r > 60 && g > 30 && b > 15 && r > g && r > b && (r - g) > 10
  if (!basicCheck) return false

  // Criterio 2: Distancia euclidiana a tonos de piel conocidos
  // Centro del espacio de piel en RGB normalizado
  const dr = r - 180, dg = g - 130, db = b - 100
  const skinDistance = Math.sqrt(dr * dr + dg * dg + db * db)
  
  // Criterio 3: Relación R/G (la piel tiene más rojo que verde)
  const rgRatio = g > 0 ? r / g : 0
  
  return skinDistance < 120 && rgRatio > 0.9 && rgRatio < 2.2
}

export function useBackgroundRemoval() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const animRef = useRef<number>(0)
  const bgRef = useRef<BackgroundOption>({ mode: 'none', label: 'Sin fondo' })
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const segmenterRef = useRef<ImageSegmenter | null>(null)
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
        const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision')
        if (cancelled) return

        const vision = await FilesetResolver.forVisionTasks(
          // WASM local (sin CDN): evita doble-slash 400 y dependencia externa
          new URL('/mediapipe/wasm/', window.location.origin).href
        )
        if (cancelled) return

        segmenterRef.current = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              // Modelo local (sin CDN): selfie_segmenter float16 249KB
              new URL('/mediapipe/models/selfie_segmenter.tflite', window.location.origin).href,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        })

        if (!cancelled) {
          setIsModelReady(true)
          setModelLoading(false)
          console.log('[BgRemoval] ✅ MediaPipe SelfieSegmenter listo')
        }
      } catch (err) {
        // Sin ML disponible: processFrame usa el fallback por deteccion de piel
        console.warn('[BgRemoval] MediaPipe no disponible, usando fallback por color:', err)
        if (!cancelled) {
          setIsModelReady(false)
          setModelLoading(false)
        }
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  // Matrix rain initializer
  const initMatrix = (w: number, h: number) => {
    const cols = Math.floor(w / 14)
    matrixDropsRef.current = Array.from({ length: cols }, (_, i) => ({
      x: i * 14,
      y: Math.random() * h,
      speed: 1 + Math.random() * 3,
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

  // Draw background image with caching
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
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(0, 0, w, h)
    }
  }

  // Draw background (color or image) into the given context
  const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number, bg: BackgroundOption) => {
    if (bg.mode === 'image' && bg.image) {
      drawBgImage(ctx, w, h, bg.image)
    } else if (bg.color) {
      ctx.fillStyle = bg.color
      ctx.fillRect(0, 0, w, h)
    }
  }

  /**
   * Segmenta persona del fondo usando MediaPipe
   * Retorna true si se aplicó segmentación, false si falló
   */
  const segmentWithMediaPipe = (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    w: number,
    h: number,
    bg: BackgroundOption
  ): boolean => {
    const segmenter = segmenterRef.current
    if (!segmenter) return false

    try {
      const result = segmenter.segmentForVideo(video, performance.now())
      
      // En @mediapipe/tasks-vision v0.10.x, categoryMask es un MPMask
      // con método getAsFloat32Array() que retorna Float32Array de largo w*h
      const mask = result?.categoryMask
      if (!mask) return false

      // 1. Dibujar fondo primero
      drawBackground(ctx, w, h, bg)

      // 2. Obtener datos de la máscara (confianza 0.0 - 1.0 por píxel)
      const maskData: Float32Array = mask.getAsFloat32Array()
      if (!maskData || maskData.length === 0) return false

      // 3. Capturar frame del video en un canvas temporal
      const videoCanvas = document.createElement('canvas')
      videoCanvas.width = w
      videoCanvas.height = h
      const vCtx = videoCanvas.getContext('2d')!
      vCtx.drawImage(video, 0, 0, w, h)
      const videoPixels = vCtx.getImageData(0, 0, w, h)

      // 4. Obtener píxeles actuales del canvas (fondo ya dibujado)
      const outputPixels = ctx.getImageData(0, 0, w, h)
      const out = outputPixels.data
      const vData = videoPixels.data

      // 5. Hacer compositing: donde mask > threshold, poner pixel de video
      const threshold = 0.5
      for (let i = 0; i < maskData.length; i++) {
        if (maskData[i] > threshold) {
          const idx = i * 4
          out[idx]     = vData[idx]
          out[idx + 1] = vData[idx + 1]
          out[idx + 2] = vData[idx + 2]
          out[idx + 3] = 255
        }
        // else → mantener el fondo (ya dibujado)
      }

      ctx.putImageData(outputPixels, 0, 0)
      mask.close()
      return true
    } catch (err) {
      console.warn('[BgRemoval] Error en segmentación ML, usando fallback:', err)
      return false
    }
  }

  /**
   * Fallback: detección de piel por color para separar persona del fondo.
   * Menos precisa que ML pero funcional.
   */
  const segmentWithColorFallback = (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    w: number,
    h: number,
    currentBg: BackgroundOption
  ) => {
    // 1. Dibujar fondo PRIMERO
    drawBackground(ctx, w, h, currentBg)
    
    // 2. Guardar píxeles del fondo (antes de dibujar el video encima)
    const bgPixelsData = ctx.getImageData(0, 0, w, h)
    const bgData = bgPixelsData.data  // ← ANTES se llamaba 'bg' y sombreaba bgRef.current
    
    // 3. Dibujar video encima
    ctx.drawImage(video, 0, 0, w, h)
    
    // 4. Obtener píxeles combinados (video sobre fondo)
    const combined = ctx.getImageData(0, 0, w, h)
    const pixels = combined.data
    
    // 5. Detectar piel y reemplazar no-piel con fondo
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      
      if (isSkinPixel(r, g, b)) {
        // Conservar píxel de la persona (ya está en 'pixels' desde el video)
        continue
      } else {
        // Reemplazar con fondo
        pixels[i]     = bgData[i]
        pixels[i + 1] = bgData[i + 1]
        pixels[i + 2] = bgData[i + 2]
        pixels[i + 3] = 255
      }
    }
    
    ctx.putImageData(combined, 0, 0)
  }

  // Main frame processing loop
let lastProcessTime = 0;
const FRAME_INTERVAL = 83; // ~12fps

const processFrame = useCallback(() => {
    const now = performance.now();
    if (now - lastProcessTime < FRAME_INTERVAL) {
      animRef.current = requestAnimationFrame(processFrame);
      return;
    }
    lastProcessTime = now;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) {
      animRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      animRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const activeBg = bgRef.current;
    const w = canvas.width;
    const h = canvas.height;

    if (activeBg.mode === 'none') {
      ctx.drawImage(video, 0, 0, w, h);
    } else if (activeBg.mode === 'matrix') {
      // Efecto Matrix — dibujar matrix + video encima
      drawMatrix(ctx, w, h)
      ctx.drawImage(video, 0, 0, w, h)
    } else if (isModelReady && segmenterRef.current) {
      // === SEGMENTACIÓN CON MEDIAPIPE ML (GPU) ===
      const segmented = segmentWithMediaPipe(ctx, video, w, h, activeBg)
      if (!segmented) {
        segmentWithColorFallback(ctx, video, w, h, activeBg)
      }
      }
    } else {
      segmentWithColorFallback(ctx, video, w, h, activeBg);
    }

    animRef.current = requestAnimationFrame(processFrame);
  }, [isModelReady]);

  const startBackgroundRemoval = async (cameraStream: MediaStream): Promise<MediaStream | null> => {
    if (!cameraStream) return null

    // Limpiar estado previo
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (canvasRef.current?.parentNode) {
      canvasRef.current.parentNode.removeChild(canvasRef.current)
    }
    canvasRef.current = null

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

    const stream = canvas.captureStream(12)
    setProcessedStream(stream)

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
