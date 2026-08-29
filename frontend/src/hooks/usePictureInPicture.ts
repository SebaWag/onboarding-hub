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
  // Soporte REAL de la API estandar PiP (Chrome/Edge/Safari 16+).
  // Firefox NO tiene requestPictureInPicture -> usamos ventana emergente.
  const [isSupported] = useState(() =>
    typeof document !== 'undefined' &&
    typeof document.createElement('video').requestPictureInPicture === 'function'
  )
  const [isPipActive, setIsPipActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const popupRef = useRef<Window | null>(null)

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

  // Ventana emergente con la camara (fallback para Firefox y navegadores
  // sin API estandar de PiP). El usuario la arrastra donde quiera.
  const openCameraPopup = useCallback((stream: MediaStream) => {
    try {
      const w = window.open('', '_blank', 'width=340,height=260,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no')
      if (!w) {
        console.warn('[PiP] No se pudo abrir la ventana de camara (popup bloqueado)')
        return false
      }
      w.document.write('<!DOCTYPE html><html><head><title>Camara flotante</title></head>')
      w.document.write('<body style="margin:0;background:#000;overflow:hidden">')
      w.document.write('<video id="cam" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></video>')
      w.document.write('</body></html>')
      w.document.close()
      const v = w.document.getElementById('cam') as HTMLVideoElement | null
      if (v) v.srcObject = stream
      popupRef.current = w
      w.addEventListener('beforeunload', () => { popupRef.current = null; setIsPipActive(false) })
      setIsPipActive(true)
      return true
    } catch (err) {
      console.warn('[PiP] Error abriendo ventana de camara:', err)
      setIsPipActive(false)
      return false
    }
  }, [])

  const enterPip = useCallback(async (stream: MediaStream, videoEl?: HTMLVideoElement | null) => {
    try {
      // Firefox / sin API estandar -> ventana emergente con la camara
      if (!isSupported) {
        openCameraPopup(stream)
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
  }, [isSupported, openCameraPopup])

  const exitPip = useCallback(async () => {
    // Cerrar ventana emergente (Firefox) si existe
    if (popupRef.current && !popupRef.current.closed) {
      try { popupRef.current.close() } catch (e) {}
      popupRef.current = null
    }
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

  // Cleanup al desmontar: cerrar PiP, ventana emergente y remover video oculto
  useEffect(() => () => {
    if (popupRef.current && !popupRef.current.closed) {
      try { popupRef.current.close() } catch (e) {}
      popupRef.current = null
    }
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
