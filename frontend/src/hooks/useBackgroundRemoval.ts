import { useRef, useState, useEffect, useCallback } from 'react'
import { CaptureClock } from '../lib/capture/captureClock'
import { compositePersonOverBackground } from '../lib/capture/compositeMask'

export type BackgroundMode = 'none' | 'color' | 'image' | 'blur' | 'matrix'

export interface BackgroundOption {
  mode: BackgroundMode
  color?: string
  image?: string
  label: string
  thumbnail?: string
}

/** Track de canvas capaz de forzar un frame explícito (`requestFrame`). */
interface RequestFrameTrack extends MediaStreamTrack {
  requestFrame?: () => void
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

// === CAPTURA v4: constantes de rendimiento ===
// FPS objetivo del pipeline. El frame se fuerza con captureTrack.requestFrame(),
// así que se mantiene incluso con la pestaña oculta (donde rAF/setInterval mueren).
const BG_FPS = 30
// Tope del procesamiento pesado (segmentación): ~18 fps máx para no saturar el
// main thread. Entre frames pesados se redibuja la última composición cacheada.
const HEAVY_FRAME_MIN_MS = 1000 / 18

/**
 * Detección de piel mejorada para fallback cuando el modelo de segmentación no
 * está disponible. Usa un espacio de color YCrCb para mejor precisión en
 * distintos tonos de piel.
 */
function isSkinPixel(r: number, g: number, b: number): boolean {
  const basicCheck = r > 60 && g > 30 && b > 15 && r > g && r > b && (r - g) > 10
  if (!basicCheck) return false

  const dr = r - 180, dg = g - 130, db = b - 100
  const skinDistance = Math.sqrt(dr * dr + dg * dg + db * db)

  const rgRatio = g > 0 ? r / g : 0

  return skinDistance < 120 && rgRatio > 0.9 && rgRatio < 2.2
}

/**
 * Carrera contra reloj: si una promesa no resuelve en `ms`, rechaza.
 * Evita que un modelo que no carga (red/WASM/delegate) deje el fondo colgado.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout de carga del modelo')), ms)),
  ])
}

export function useBackgroundRemoval() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const bgRef = useRef<BackgroundOption>({ mode: 'none', label: 'Sin fondo' })
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const segmenterRef = useRef<any>(null)
  const bodypixNetRef = useRef<any>(null)
  const matrixDropsRef = useRef<{ x: number; y: number; speed: number }[]>([])
  // === CAPTURA v4: control del pipeline ===
  const clockRef = useRef<CaptureClock | null>(null)
  const captureTrackRef = useRef<RequestFrameTrack | null>(null)
  // Canvas reutilizable para leer los píxeles del video (evita allocar por frame).
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const isModelReadyRef = useRef<boolean>(false)
  const isRunningRef = useRef<boolean>(false)
  const lastHeavyFrameRef = useRef<number>(0)
  // Evita apilar varias segmentaciones asíncronas (BodyPix) sin terminar.
  const busyRef = useRef<boolean>(false)
  const lastCompositeRef = useRef<HTMLCanvasElement | null>(null)
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null)
  const [isModelReady, setIsModelReady] = useState(false)
  const [background, setBackground] = useState<BackgroundOption>({ mode: 'none', label: 'Sin fondo' })
  const [modelLoading, setModelLoading] = useState(false)

  // Initialize MediaPipe ImageSegmenter (selfie segmentation, GPU)
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      setModelLoading(true)
      try {
        const visionModule = await import('@mediapipe/tasks-vision')
        // OJO: @mediapipe/tasks-vision NO exporta `SelfieSegmenter` (ese nombre
        // no existe) → el código anterior siempre fallaba aquí y caía a BodyPix.
        // La tarea correcta es `ImageSegmenter`.
        const { ImageSegmenter, FilesetResolver } = visionModule
        if (cancelled) return

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/'
        )
        if (cancelled) return

        const segmenterPromise = ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/selfie_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        })
        segmenterRef.current = await withTimeout(segmenterPromise, 12000)

        if (!cancelled) {
          setIsModelReady(true)
          setModelLoading(false)
          console.log('[BgRemoval] ✅ MediaPipe ImageSegmenter listo')
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

  const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number, bg: BackgroundOption) => {
    if (bg.mode === 'image' && bg.image) {
      drawBgImage(ctx, w, h, bg.image)
    } else if (bg.color) {
      ctx.fillStyle = bg.color
      ctx.fillRect(0, 0, w, h)
    }
  }

  /** Devuelve (o crea) el canvas reutilizable para leer los píxeles del video. */
  const getVideoCanvas = (w: number, h: number): HTMLCanvasElement => {
    let c = videoCanvasRef.current
    if (!c) {
      c = document.createElement('canvas')
      videoCanvasRef.current = c
    }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    return c
  }

  /**
   * Segmenta persona del fondo usando MediaPipe (GPU) y compone el frame.
   * Se lee la máscara DENTRO del callback (su lifetime es válido solo ahí).
   * Retorna true si aplicó segmentación.
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

    let applied = false
    try {
      segmenter.segmentForVideo(video, performance.now(), (result: any) => {
        const mask = result?.confidenceMasks?.[0] ?? result?.categoryMask
        if (!mask) return

        // 1. Dibujar fondo primero (queda como base del canvas)
        drawBackground(ctx, w, h, bg)

        // 2. Capturar el frame del video en un canvas temporal reutilizable
        const videoCanvas = getVideoCanvas(w, h)
        const vCtx = videoCanvas.getContext('2d', { willReadFrequently: true })
        if (!vCtx) return
        vCtx.drawImage(video, 0, 0, w, h)
        const vData = vCtx.getImageData(0, 0, w, h)

        // 3. Obtener píxeles del canvas (fondo ya dibujado)
        const outputPixels = ctx.getImageData(0, 0, w, h)

        // 4. Componer: donde la máscara > umbral → píxel del video. La máscara
        //    suele ser menor que el lienzo → muestreo por vecino más cercano.
        const maskData = mask.getAsFloat32Array()
        compositePersonOverBackground(
          outputPixels.data,
          vData.data,
          maskData,
          w,
          h,
          mask.width,
          mask.height,
          0.5
        )

        ctx.putImageData(outputPixels, 0, 0)
        applied = true
      })
    } catch (err) {
      console.warn('[BgRemoval] Error en segmentación MediaPipe, usando fallback:', err)
      return false
    }
    return applied
  }

  /** Fallback: detección de piel por color. */
  const segmentWithColorFallback = (
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    w: number,
    h: number,
    currentBg: BackgroundOption
  ) => {
    drawBackground(ctx, w, h, currentBg)
    const bgPixelsData = ctx.getImageData(0, 0, w, h)
    const bgData = bgPixelsData.data

    ctx.drawImage(video, 0, 0, w, h)
    const combined = ctx.getImageData(0, 0, w, h)
    const pixels = combined.data

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]
      const g = pixels[i + 1]
      const b = pixels[i + 2]
      if (isSkinPixel(r, g, b)) continue
      pixels[i] = bgData[i]
      pixels[i + 1] = bgData[i + 1]
      pixels[i + 2] = bgData[i + 2]
      pixels[i + 3] = 255
    }

    ctx.putImageData(combined, 0, 0)
  }

  /** Segmentación con BodyPix (TensorFlow.js) — fallback si MediaPipe falla. */
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
      drawBackground(ctx, w, h, bg)
      const outputPixels = ctx.getImageData(0, 0, w, h)
      const videoCanvas = getVideoCanvas(w, h)
      const vCtx = videoCanvas.getContext('2d', { willReadFrequently: true })
      if (!vCtx) return false
      vCtx.drawImage(video, 0, 0, w, h)
      const vData = vCtx.getImageData(0, 0, w, h)
      // BodyPix entrega una máscara binaria (0/1) por píxel, ya a resolución del frame.
      compositePersonOverBackground(outputPixels.data, vData.data, segmentation.data, w, h, w, h, 0.5)
      ctx.putImageData(outputPixels, 0, 0)
      return true
    } catch (err) {
      console.warn('[BgRemoval] Error en BodyPix:', err)
      return false
    }
  }

  /** Guarda una copia del último frame compuesto (para los frames saltados por el throttle). */
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

  // BodyPix frame counter (process every other frame for performance)
  let bodypixFrameCount = 0

  /**
   * Renderiza UN frame y fuerza su captura en el stream.
   * Es invocado por el CaptureClock (worker), así que funciona con la pestaña
   * oculta. SIEMPRE llama a requestFrame() para que el stream nunca se congele.
   */
  const renderFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0) {
      captureTrackRef.current?.requestFrame?.()
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      captureTrackRef.current?.requestFrame?.()
      return
    }

    const activeBg = bgRef.current
    const w = canvas.width
    const h = canvas.height
    const modelReady = isModelReadyRef.current

    // === THROTTLE del camino pesado (segmentación) ===
    const isHeavyPath = activeBg.mode !== 'none' && activeBg.mode !== 'matrix'
    const now = performance.now()
    if (isHeavyPath && now - lastHeavyFrameRef.current < HEAVY_FRAME_MIN_MS) {
      const cached = lastCompositeRef.current
      if (cached && cached.width === w && cached.height === h) {
        ctx.drawImage(cached, 0, 0, w, h)
      } else {
        ctx.drawImage(video, 0, 0, w, h)
      }
      captureTrackRef.current?.requestFrame?.()
      return
    }
    if (isHeavyPath) lastHeavyFrameRef.current = now

    if (activeBg.mode === 'none') {
      ctx.drawImage(video, 0, 0, w, h)
    } else if (activeBg.mode === 'matrix') {
      drawMatrix(ctx, w, h)
      ctx.drawImage(video, 0, 0, w, h)
    } else if (modelReady && segmenterRef.current) {
      const segmented = segmentWithMediaPipe(ctx, video, w, h, activeBg)
      if (!segmented) segmentWithColorFallback(ctx, video, w, h, activeBg)
      cacheComposite(ctx, w, h)
    } else if (modelReady && bodypixNetRef.current) {
      bodypixFrameCount++
      if (bodypixFrameCount % 2 === 0 && !busyRef.current) {
        busyRef.current = true
        segmentWithBodyPix(ctx, video, w, h, activeBg)
          .then((success) => { if (success) cacheComposite(ctx, w, h) })
          .catch(() => { /* noop */ })
          .finally(() => { busyRef.current = false })
      }
    } else {
      // Modelo no listo → video directo (nunca bloquear con el fallback píxel a píxel)
      ctx.drawImage(video, 0, 0, w, h)
    }

    // Forzar la captura del frame recién compuesto (clave para pestaña oculta).
    captureTrackRef.current?.requestFrame?.()
  }, [])

  // Sincronizar el ref con el state del modelo
  useEffect(() => {
    isModelReadyRef.current = isModelReady
  }, [isModelReady])

  const startBackgroundRemoval = async (cameraStream: MediaStream): Promise<MediaStream | null> => {
    if (!cameraStream) return null

    // Limpiar estado previo
    clockRef.current?.stop()
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

    // captureStream(0): NO captura por compositor; cada frame se fuerza con
    // requestFrame(). Así la captura no depende de que la pestaña sea visible.
    // OJO: captureStream(0) NO sirve fuera de Chrome/Safari: con frameRate 0 la
    // captura ocurre SOLO al llamar requestFrame(), y Firefox NO implementa
    // CanvasCaptureMediaStreamTrack.requestFrame (0 frames -> cámara congelada).
    // Usamos captura automática a BG_FPS y ADEMÁS forzamos requestFrame() cuando
    // el navegador lo soporte (Chrome) para máxima determinismo.
    const stream = canvas.captureStream(BG_FPS)
    const captureTrack = stream.getVideoTracks()[0] as RequestFrameTrack | undefined
    captureTrackRef.current = captureTrack ?? null
    setProcessedStream(stream)

    // Arrancar el reloj (worker → inmune al throttling de pestaña oculta)
    isRunningRef.current = true
    lastHeavyFrameRef.current = 0
    lastCompositeRef.current = null
    clockRef.current = new CaptureClock()
    clockRef.current.start(BG_FPS, renderFrame)
    // Primer frame inmediato
    renderFrame()

    return stream
  }

  const changeBackground = (option: BackgroundOption) => {
    bgRef.current = option
    setBackground(option)
  }

  const cleanup = () => {
    console.log('[BgRemoval] 🧹 cleanup: deteniendo reloj de captura')
    isRunningRef.current = false
    clockRef.current?.stop()
    clockRef.current = null
    captureTrackRef.current = null
    busyRef.current = false
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
    videoCanvasRef.current = null
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
