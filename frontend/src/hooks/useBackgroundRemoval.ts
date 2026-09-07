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
  // Fondos del Lab — Fuera del Lab (canal YouTube)
  { mode: 'image', image: '/backgrounds/lab-servidores.jpg', label: 'Lab: Servidores', thumbnail: '/backgrounds/lab-servidores.jpg' },
  { mode: 'image', image: '/backgrounds/lab-terminal.jpg', label: 'Lab: Terminal', thumbnail: '/backgrounds/lab-terminal.jpg' },
  { mode: 'image', image: '/backgrounds/lab-taller.jpg', label: 'Lab: Taller', thumbnail: '/backgrounds/lab-taller.jpg' },
  // Efecto Matrix
  { mode: 'matrix', label: 'Matrix Rain' },
]

// Matrix effect characters
const MATRIX_CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'

// === FIX CÁMARA v3: constantes de rendimiento (NO tocar resoluciones) ===
// Intervalo de refresco mientras la pestaña está oculta (auto-PiP pausa el rAF).
const HIDDEN_FRAME_INTERVAL_MS = 120
// Tope del procesamiento pesado (segmentación): ~18 fps máx. para no saturar el main thread.
const HEAVY_FRAME_MIN_MS = 1000 / 18

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
  const segmenterRef = useRef<any>(null)
  const bodypixNetRef = useRef<any>(null)
  const matrixDropsRef = useRef<{ x: number; y: number; speed: number }[]>([])
  // === FIX CÁMARA v3: refs de control del loop ===
  const isModelReadyRef = useRef<boolean>(false)
  const isRunningRef = useRef<boolean>(false)
  const hiddenIntervalRef = useRef<number>(0)
  const lastHeavyFrameRef = useRef<number>(0)
  const lastCompositeRef = useRef<HTMLCanvasElement | null>(null)
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
        const visionModule = await import('@mediapipe/tasks-vision')
        const SelfieSegmenter = (visionModule as any).SelfieSegmenter
        const { FilesetResolver } = visionModule
        if (cancelled) return

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/'
        )
        if (cancelled) return

        segmenterRef.current = await SelfieSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/selfie_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
        })

        if (!cancelled) {
          setIsModelReady(true)
          setModelLoading(false)
          console.log('[BgRemoval] ✅ MediaPipe SelfieSegmenter listo')
        }
      } catch (err) {
        console.warn('[BgRemoval] MediaPipe no disponible, intentando BodyPix...', err)
        // Attempt 2: BodyPix (TensorFlow.js) — segmentación de PERSONA COMPLETA
        try {
          await import('@tensorflow/tfjs')
          const bodyPix = await import('@tensorflow-models/body-pix')
          if (cancelled) return
          bodypixNetRef.current = await bodyPix.load({
            architecture: 'MobileNetV1',
            outputStride: 16,
            multiplier: 0.75,
            quantBytes: 2,
          })
          if (!cancelled) {
            setIsModelReady(true)
            setModelLoading(false)
            console.log('[BgRemoval] ✅ BodyPix listo (persona completa)')
            return
          }
        } catch (err2) {
          console.warn('[BgRemoval] BodyPix no disponible, usando fallback por color:', err2)
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
      const result = segmenter.segment(video, { timestamp: performance.now() })
      
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

  /** Segmentación con BodyPix (TensorFlow.js) — persona completa */
  const segmentWithBodyPix = async (
    ctx: CanvasRenderingContext2D, video: HTMLVideoElement, w: number, h: number, bg: BackgroundOption
  ): Promise<boolean> => {
    const net = bodypixNetRef.current
    if (!net) return false
    try {
      const segmentation = await net.segmentPerson(video, {
        flipHorizontal: true,
        internalResolution: 'medium',
        segmentationThreshold: 0.7,
      })

      // 1. Dibujar fondo
      drawBackground(ctx, w, h, bg)

      // 2. Obtener píxeles del canvas (fondo)
      const outputPixels = ctx.getImageData(0, 0, w, h)
      const out = outputPixels.data

      // 3. Obtener píxeles del video
      const videoCanvas = document.createElement('canvas')
      videoCanvas.width = w; videoCanvas.height = h
      const vCtx = videoCanvas.getContext('2d')!
      vCtx.drawImage(video, 0, 0, w, h)
      const vData = vCtx.getImageData(0, 0, w, h).data

      // 4. Composición: donde mask=1 (persona) → video, donde mask=0 (fondo) → mantener fondo
      const maskData = segmentation.data
      for (let i = 0; i < maskData.length; i++) {
        if (maskData[i] === 1) {
          const idx = i * 4
          out[idx]     = vData[idx]
          out[idx + 1] = vData[idx + 1]
          out[idx + 2] = vData[idx + 2]
          out[idx + 3] = 255
        }
        // else → mantener fondo (ya dibujado)
      }
      ctx.putImageData(outputPixels, 0, 0)
      return true
    } catch (err) {
      console.warn('[BgRemoval] Error en BodyPix:', err)
      return false
    }
  }

  /**
   * Frame LIGERO: solo ctx.drawImage(video) — sin segmentación ni getImageData.
   * Se usa cuando la pestaña está oculta (rAF pausado por el navegador) para que
   * canvas.captureStream() siga recibiendo frames y la grabación no se congele.
   */
  const drawLightFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  }, [])

  /**
   * Guarda una copia del último frame compuesto (fondo + persona).
   * Los frames saltados por el throttle la redibujan (barato) en vez de
   * volver a segmentar, así el canvas nunca queda estático.
   */
  const cacheComposite = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    let cached = lastCompositeRef.current
    if (!cached) {
      cached = document.createElement('canvas')
      lastCompositeRef.current = cached
    }
    if (cached.width !== w || cached.height !== h) {
      cached.width = w
      cached.height = h
    }
    cached.getContext('2d')?.drawImage(ctx.canvas, 0, 0)
  }

  // BodyPix frame counter (process every 3rd frame for performance)
  let bodypixFrameCount = 0

  // Main frame processing loop
  const processFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) {
      animRef.current = requestAnimationFrame(processFrame)
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      animRef.current = requestAnimationFrame(processFrame)
      return
    }

    const activeBg = bgRef.current
    const w = canvas.width
    const h = canvas.height
    // Se lee desde el ref (no del state) para que el loop nunca use un closure viejo
    const modelReady = isModelReadyRef.current

    // === THROTTLE (FIX CÁMARA v3) ===
    // La segmentación ML es costosa. Si el último frame pesado fue hace menos de
    // HEAVY_FRAME_MIN_MS (~18 fps), saltamos el procesamiento y redibujamos la última
    // composición. Así el main thread no se satura y el video no se corta.
    const isHeavyPath = activeBg.mode !== 'none' && activeBg.mode !== 'matrix'
    const now = performance.now()
    if (isHeavyPath && now - lastHeavyFrameRef.current < HEAVY_FRAME_MIN_MS) {
      const cached = lastCompositeRef.current
      if (cached && cached.width === w && cached.height === h) {
        ctx.drawImage(cached, 0, 0, w, h)
      } else {
        ctx.drawImage(video, 0, 0, w, h)
      }
      animRef.current = requestAnimationFrame(processFrame)
      return
    }
    if (isHeavyPath) lastHeavyFrameRef.current = now

    if (activeBg.mode === 'none') {
      // Sin efecto — mostrar video directamente
      ctx.drawImage(video, 0, 0, w, h)
    } else if (activeBg.mode === 'matrix') {
      // Efecto Matrix — dibujar matrix + video encima
      drawMatrix(ctx, w, h)
      ctx.drawImage(video, 0, 0, w, h)
    } else if (modelReady && segmenterRef.current) {
      // === SEGMENTACIÓN CON MEDIAPIPE ML (GPU) ===
      const segmented = segmentWithMediaPipe(ctx, video, w, h, activeBg)
      if (!segmented) {
        segmentWithColorFallback(ctx, video, w, h, activeBg)
      }
      cacheComposite(ctx, w, h)
    } else if (modelReady && bodypixNetRef.current) {
      // === SEGMENTACIÓN CON BODYPIX (TensorFlow.js, persona completa) ===
      bodypixFrameCount++
      // Procesar cada 2 frames para rendimiento
      if (bodypixFrameCount % 2 === 0) {
        segmentWithBodyPix(ctx, video, w, h, activeBg).then(success => {
          if (success) {
            cacheComposite(ctx, w, h)
          } else {
            ctx.drawImage(video, 0, 0, w, h)
          }
        })
        // Mostrar frame anterior mientras BodyPix procesa
      } else {
        // En frames alternos, dibujar el último resultado de BodyPix
        // (ya está en el canvas del frame anterior)
      }
    } else {
      // === MODELO NO LISTO (FIX CÁMARA v3): dibujar el video directo ===
      // El fallback píxel a píxel (getImageData/putImageData sobre el frame completo) bloquea
      // el main thread y congela el canvas → la grabación queda con cortes.
      ctx.drawImage(video, 0, 0, w, h)
    }

    animRef.current = requestAnimationFrame(processFrame)
  }, [])

  // Sincronizar el ref con el state del modelo
  useEffect(() => {
    isModelReadyRef.current = isModelReady
  }, [isModelReady])

  // === FIX CÁMARA v3: pestaña oculta (auto-PiP) pausa requestAnimationFrame ===
  // Con la pestaña oculta el rAF deja de correr, el canvas no se actualiza y
  // captureStream() se congela: el video grabado queda cortado (solo avanza el audio).
  // Solución: mientras esté oculto, dibujar frames ligeros con un setInterval.
  const stopHiddenLoop = useCallback(() => {
    if (hiddenIntervalRef.current) {
      clearInterval(hiddenIntervalRef.current)
      hiddenIntervalRef.current = 0
    }
  }, [])

  const startHiddenLoop = useCallback(() => {
    stopHiddenLoop()
    drawLightFrame()
    hiddenIntervalRef.current = window.setInterval(drawLightFrame, HIDDEN_FRAME_INTERVAL_MS)
  }, [drawLightFrame, stopHiddenLoop])

  const startVisibleLoop = useCallback(() => {
    stopHiddenLoop()
    if (animRef.current) cancelAnimationFrame(animRef.current)
    lastHeavyFrameRef.current = 0
    animRef.current = requestAnimationFrame(processFrame)
  }, [processFrame, stopHiddenLoop])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!isRunningRef.current) return
      if (document.hidden) {
        console.log('[BgRemoval] 🙈 Pestaña oculta (PiP): rAF → setInterval de frames ligeros')
        if (animRef.current) {
          cancelAnimationFrame(animRef.current)
          animRef.current = 0
        }
        startHiddenLoop()
      } else {
        console.log('[BgRemoval] 👁 Pestaña visible: restaurando requestAnimationFrame')
        startVisibleLoop()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stopHiddenLoop()
    }
  }, [startHiddenLoop, startVisibleLoop, stopHiddenLoop])

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

    const stream = canvas.captureStream(30)
    setProcessedStream(stream)

    // === FIX CÁMARA v3: arrancar el loop correcto según visibilidad ===
    isRunningRef.current = true
    lastHeavyFrameRef.current = 0
    lastCompositeRef.current = null
    if (document.hidden) {
      // Ya estamos ocultos (PiP): el rAF no corre, usar el interval ligero
      startHiddenLoop()
    } else {
      animRef.current = requestAnimationFrame(processFrame)
    }

    return stream
  }

  const changeBackground = (option: BackgroundOption) => {
    bgRef.current = option
    setBackground(option)
  }

  const cleanup = () => {
    console.log('[BgRemoval] 🧹 cleanup: deteniendo rAF + interval de pestaña oculta')
    isRunningRef.current = false
    stopHiddenLoop()
    if (animRef.current) cancelAnimationFrame(animRef.current)
    animRef.current = 0
    if (canvasRef.current?.parentNode) {
      canvasRef.current.parentNode.removeChild(canvasRef.current)
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    canvasRef.current = null
    videoRef.current = null
    lastCompositeRef.current = null
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
