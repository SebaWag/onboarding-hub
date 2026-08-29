import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * usePictureInPicture
 *
 * Camara flotante nativa del navegador (Picture-in-Picture API).
 * Crea un <video> oculto con el stream de camara y lo muestra en una
 * ventana flotante del sistema por encima de TODAS las ventanas
 * (como Loom/Zoom), para que el usuario se vea mientras graba el tutorial
 * en otra app/pestaña.
 *
 * Uso:
 *   const { isSupported, isPipActive, enterPip, exitPip } = usePictureInPicture(
 *     () => processedStream || cameraStream
 *   )
 */
export function usePictureInPicture(getStream?: () => MediaStream | null) {
  // Soporte: document.pictureInPictureEnabled (Chrome/Edge/Safari 16+)
  const [isSupported] = useState(() =>
    typeof document !== 'undefined' &&
    'pictureInPictureEnabled' in document &&
    document.pictureInPictureEnabled
  )
  const [isPipActive, setIsPipActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Mantener el callback actualizado sin recrear enterPip/exitPip
  const getStreamRef = useRef(getStream)
  useEffect(() => { getStreamRef.current = getStream })

  /**
   * Crea (o reutiliza) el <video> oculto y le asigna el stream.
   * Nota: oculto con position fixed fuera del viewport (display:none
   * bloquea el playback en algunos navegadores). Los eventos
   * enter/leavepictureinpicture se disparan sobre el propio <video>
   * segun la spec PiP, ahi se sincroniza isPipActive (incluye el caso
   * de que el usuario cierre la ventana con la X).
   */
  const ensureVideo = (stream: MediaStream): HTMLVideoElement => {
    let video = videoRef.current
    if (!video) {
      video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.autoplay = true
      video.style.position = 'fixed'
      video.style.top = '-9999px'
      video.style.left = '-9999px'
      video.style.width = '1px'
      video.style.height = '1px'
      document.body.appendChild(video)

      video.addEventListener('enterpictureinpicture', () => setIsPipActive(true))
      video.addEventListener('leavepictureinpicture', () => setIsPipActive(false))
      videoRef.current = video
    }
    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    return video
  }

  const enterPip = useCallback(async (stream: MediaStream, videoEl?: HTMLVideoElement | null) => {
    try {
      if (!isSupported) {
        console.warn('[PiP] Picture-in-Picture no soportado en este navegador')
        return
      }
      // Usar el video REAL visible si se pasa (mas confiable para el navegador),
      // si no, crear el video oculto como fallback.
      let video = videoEl && videoEl.srcObject === stream ? videoEl : null
      if (!video) {
        video = ensureVideo(stream)
      }
      if (video.paused) await video.play()
      if (document.pictureInPictureElement === video) {
        setIsPipActive(true)
        return
      }
      await video.requestPictureInPicture()
      setIsPipActive(true) // optimista; los eventos del video lo sincronizan igual
    } catch (err) {
      console.warn('[PiP] No se pudo entrar a Picture-in-Picture:', err)
      setIsPipActive(false)
    }
  }, [isSupported])

  const exitPip = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      }
    } catch (err) {
      console.warn('[PiP] No se pudo salir de Picture-in-Picture:', err)
    } finally {
      // Limpiar el <video> oculto (dejar de alimentar la ventana PiP)
      const video = videoRef.current
      if (video) {
        video.pause()
        video.srcObject = null
        video.remove()
        videoRef.current = null
      }
      setIsPipActive(false)
    }
  }, [])

  // Si el stream cambia (ej: se activa background removal), actualizar srcObject
  useEffect(() => {
    const stream = getStreamRef.current?.()
    const video = videoRef.current
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream
      if (video.paused) video.play().catch(() => {})
    }
  }) // sin deps: corre en cada render y la comparacion es barata

  // Cleanup al desmontar: cerrar PiP y remover el <video> oculto
  useEffect(() => () => {
    const video = videoRef.current
    if (document.pictureInPictureElement === video) {
      document.exitPictureInPicture().catch(() => {})
    }
    if (video) {
      video.pause()
      video.srcObject = null
      video.remove()
      videoRef.current = null
    }
  }, [])

  return { isSupported, isPipActive, enterPip, exitPip }
}

export default usePictureInPicture
