import { useState, useRef, useCallback, useEffect } from 'react'

export type RecordingMode = 'screen' | 'camera' | 'screen-camera'

export interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  recordingTime: number
  hasPermission: boolean
  permissionError: string | null
  screenStream: MediaStream | null
  cameraStream: MediaStream | null
  audioStream: MediaStream | null
}

export interface UseMediaRecorderOptions {
  audioEnabled?: boolean
  cameraEnabled?: boolean
  onDataAvailable?: (blob: Blob) => void
  onError?: (error: Error) => void
}

export function useMediaRecorder(options: UseMediaRecorderOptions = {}) {
  const {
    audioEnabled = true,
    cameraEnabled = true,
    onDataAvailable,
    onError
  } = options

  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    recordingTime: 0,
    hasPermission: false,
    permissionError: null,
    screenStream: null,
    cameraStream: null,
    audioStream: null
  })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const combinedStreamRef = useRef<MediaStream | null>(null)
  const streamsRef = useRef<{ screen: MediaStream | null, camera: MediaStream | null, audio: MediaStream | null }>({ screen: null, camera: null, audio: null })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const intervalRef = useRef<number | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (intervalRef.current) { cancelAnimationFrame(intervalRef.current); intervalRef.current = null }
    if (mediaRecorderRef.current?.state !== 'inactive') { try { mediaRecorderRef.current?.stop() } catch (e) {} }
    
    streamsRef.current.screen?.getTracks().forEach(t => t.stop())
    streamsRef.current.camera?.getTracks().forEach(t => t.stop())
    streamsRef.current.audio?.getTracks().forEach(t => t.stop())
    combinedStreamRef.current?.getTracks().forEach(t => t.stop())
    
    if (screenVideoRef.current) { screenVideoRef.current.pause(); screenVideoRef.current.srcObject = null }
    if (cameraVideoRef.current) { cameraVideoRef.current.pause(); cameraVideoRef.current.srcObject = null }
    if (canvasRef.current?.parentNode) { canvasRef.current.parentNode.removeChild(canvasRef.current) }
    
    combinedStreamRef.current = null
    mediaRecorderRef.current = null
    chunksRef.current = []
    streamsRef.current = { screen: null, camera: null, audio: null }
    canvasRef.current = null
    screenVideoRef.current = null
    cameraVideoRef.current = null
  }, [])

  useEffect(() => { return () => { cleanup() } }, [cleanup])

  const startRecording = useCallback(async (mode: RecordingMode, processedCameraStream?: MediaStream | null): Promise<boolean> => {
    try {
      cleanup()
      
      console.log('[RECORDER] ===== INICIANDO GRABACIÓN =====')
      console.log('[RECORDER] Modo:', mode)
      
      let screenStream: MediaStream | null = null
      let cameraStream: MediaStream | null = null
      let audioStream: MediaStream | null = null

      // 1. Obtener pantalla
      if (mode === 'screen' || mode === 'screen-camera') {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
            audio: true
          })
          console.log('[RECORDER] ✅ Pantalla capturada')
          screenStream?.getVideoTracks()[0].addEventListener('ended', () => stopRecording())
        } catch (err: any) {
          if (mode === 'screen') throw new Error('Permiso de pantalla denegado')
          console.warn('[RECORDER] ⚠️ Sin pantalla')
        }
      }

      // 2. Obtener cámara
      if (cameraEnabled && (mode === 'camera' || mode === 'screen-camera')) {
        try {
          if (processedCameraStream && processedCameraStream.getVideoTracks().length > 0) {
            cameraStream = processedCameraStream
            console.log('[RECORDER] ✅ Usando cámara con background procesado')
          } else {
            cameraStream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
              audio: false
            })
            console.log('[RECORDER] ✅ Cámara capturada')
          }
        } catch (err: any) {
          console.warn('[RECORDER] ⚠️ Sin cámara')
        }
      }

      // 3. Obtener micrófono
      if (audioEnabled) {
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          })
          console.log('[RECORDER] ✅ Micrófono capturado')
        } catch (err: any) {
          console.warn('[RECORDER] ⚠️ Sin micrófono')
        }
      }

      streamsRef.current = { screen: screenStream, camera: cameraStream, audio: audioStream }

      // 4. Crear stream combinado
      let combinedStream: MediaStream
      const hasScreen = screenStream && screenStream?.getVideoTracks().length > 0
      const hasCamera = cameraStream && cameraStream?.getVideoTracks().length > 0

      if (hasScreen && hasCamera && mode === 'screen-camera') {
        // COMPOSITOR CANVAS: Pantalla + Cámara
        console.log('[RECORDER] 🎨 Creando compositor canvas...')
        
        const canvas = document.createElement('canvas')
        canvas.width = 1920
        canvas.height = 1080
        canvas.style.position = 'fixed'
        canvas.style.top = '-9999px'
        canvas.style.left = '-9999px'
        document.body.appendChild(canvas)
        canvasRef.current = canvas
        
        const ctx = canvas.getContext('2d', { willReadFrequently: false })!
        
        // Crear videos
        const screenVideo = document.createElement('video')
        screenVideo.srcObject = screenStream
        screenVideo.muted = true
        screenVideo.playsInline = true
        screenVideo.autoplay = true
        screenVideoRef.current = screenVideo
        
        const cameraVideo = document.createElement('video')
        cameraVideo.srcObject = cameraStream
        cameraVideo.muted = true
        cameraVideo.playsInline = true
        cameraVideo.autoplay = true
        cameraVideoRef.current = cameraVideo
        
        // Esperar a que los videos estén listos
        await new Promise<void>((resolve) => {
          let readyCount = 0
          const checkReady = () => {
            readyCount++
            if (readyCount >= 2) resolve()
          }
          screenVideo.onloadeddata = () => { screenVideo.play().then(checkReady) }
          cameraVideo.onloadeddata = () => { cameraVideo.play().then(checkReady) }
          // Timeout de seguridad
          setTimeout(resolve, 2000)
        })
        
        console.log('[RECORDER] ✅ Videos listos')
        
        // Dibujar frames en el canvas
        let frameCount = 0
        
        

        const drawFrame = () => {
          try {
            // 1. Fondo: pantalla
            ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height)
            
            // 2. Cámara en esquina inferior derecha (área circular)
            const camW = 400
            const camH = 300
            const camX = canvas.width - camW - 20
            const camY = canvas.height - camH - 20
            
            // 3. Dibujar cámara
            if (cameraVideoRef.current) {
              // Guardar el área de la cámara
              ctx.save()
              ctx.beginPath()
              ctx.arc(camX + camW/2, camY + camH/2, camW/2, 0, Math.PI * 2)
              ctx.clip()
              
              // Dibujar fondo del background (si aplica)
              if (processedCameraStream && processedCameraStream.getVideoTracks().length > 0) {
                // Si hay un background activo, usar colores sólidos como fallback
                ctx.fillStyle = '#1e293b'
                ctx.fillRect(camX, camY, camW, camH)
              }
              
              // Dibujar cámara
              ctx.drawImage(cameraVideoRef.current, camX, camY, camW, camH)
              
              // La cámara ya viene con el background procesado desde processedCameraStream
              // Solo dibujar el stream que ya tiene el background aplicado
              if (processedCameraStream && processedCameraStream.getVideoTracks().length > 0) {
                // El stream ya está procesado, solo dibujarlo 
                // No se necesita chroma-key ni pixel manipulation
              }
              
              ctx.restore()
              
              // Borde blanco del círculo
              ctx.beginPath()
              ctx.arc(camX + camW/2, camY + camH/2, camW/2 + 2, 0, Math.PI * 2)
              ctx.strokeStyle = '#ffffff'
              ctx.lineWidth = 3
              ctx.stroke()
            }
            
            frameCount++
            if (frameCount % 60 === 0) {
              console.log('[RECORDER] 🎬 Frame:', frameCount)
            }
          } catch (e) {
            // Ignorar errores
          }
        }
        // Usar requestAnimationFrame para renderizado suave
        let lastFrameTime = 0
        const fpsInterval = 1000 / 30
        const rafLoop = (timestamp: number) => {
          const elapsed = timestamp - lastFrameTime
          if (elapsed >= fpsInterval) {
            lastFrameTime = timestamp - (elapsed % fpsInterval)
            drawFrame()
          }
          intervalRef.current = requestAnimationFrame(rafLoop) as unknown as number
        }
        intervalRef.current = requestAnimationFrame(rafLoop) as unknown as number
        // Capturar stream del canvas
        const canvasStream = canvas.captureStream(30)
        console.log('[RECORDER] ✅ Canvas stream capturado:', canvasStream.getVideoTracks().length, 'tracks')
        
        // Construir stream final
        const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()]
        
        // Agregar audio
        if (audioStream && audioStream && audioStream.getAudioTracks().length > 0) {
          tracks.push(...(audioStream?.getAudioTracks() || []))
          console.log('[RECORDER] ✅ Audio del micrófono agregado')
        } else if (screenStream && screenStream.getAudioTracks().length > 0) {
          tracks.push(...(screenStream?.getAudioTracks() || []))
          console.log('[RECORDER] ✅ Audio del sistema agregado')
        }
        
        combinedStream = new MediaStream(tracks)
        console.log('[RECORDER] ✅ Stream combinado creado:', tracks.length, 'tracks')
        
      } else if (hasScreen) {
        // Solo pantalla
        const tracks: MediaStreamTrack[] = [...(screenStream?.getVideoTracks() || [])]
        if (audioStream && audioStream && audioStream.getAudioTracks().length > 0) {
          tracks.push(...(audioStream?.getAudioTracks() || []))
        } else if (screenStream && screenStream.getAudioTracks().length > 0) {
          tracks.push(...(screenStream?.getAudioTracks() || []))
        }
        combinedStream = new MediaStream(tracks)
        console.log('[RECORDER] ✅ Stream de pantalla creado')
        
      } else if (hasCamera) {
        // Solo cámara
        const tracks: MediaStreamTrack[] = [...(cameraStream?.getVideoTracks() || [])]
        if (audioStream && audioStream && audioStream.getAudioTracks().length > 0) {
          tracks.push(...(audioStream?.getAudioTracks() || []))
        }
        combinedStream = new MediaStream(tracks)
        console.log('[RECORDER] ✅ Stream de cámara creado')
        
      } else {
        throw new Error('No se pudo obtener ningún stream')
      }

      combinedStreamRef.current = combinedStream

      // 5. Crear MediaRecorder
      let mimeType = 'video/webm;codecs=vp9,opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus'
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'
      }

      console.log('[RECORDER] 📹 Creando MediaRecorder:', mimeType)
      
      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 3000000,
        audioBitsPerSecond: 128000
      })

      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
          console.log('[RECORDER] 📦 Chunk:', e.data.size, 'bytes, total:', chunksRef.current.length)
        }
      }

      recorder.onstop = () => {
        console.log('[RECORDER] ⏹️ Grabación detenida, chunks:', chunksRef.current.length)
        if (intervalRef.current) { cancelAnimationFrame(intervalRef.current); intervalRef.current = null }
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType })
          console.log('[RECORDER] 🎬 Blob final:', blob.size, 'bytes')
          onDataAvailable?.(blob)
        } else {
          console.error('[RECORDER] ❌ Sin datos!')
        }
      }

      recorder.onerror = (e: any) => {
        console.error('[RECORDER] ❌ Error:', e.error)
        onError?.(new Error('Error en grabación'))
      }

      // 6. Iniciar grabación
      recorder.start(1000) // Chunks de 1 segundo
      mediaRecorderRef.current = recorder

      timerRef.current = window.setInterval(() => {
        setState(prev => ({ ...prev, recordingTime: prev.recordingTime + 1 }))
      }, 1000)

      setState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        recordingTime: 0,
        hasPermission: true,
        permissionError: null,
        screenStream,
        cameraStream,
        audioStream
      }))

      console.log('[RECORDER] 🎬 ¡GRABACIÓN INICIADA!')
      return true
      
    } catch (err: any) {
      console.error('[RECORDER] ❌ Error:', err.message)
      setState(prev => ({ ...prev, permissionError: err.message }))
      onError?.(err)
      cleanup()
      return false
    }
  }, [audioEnabled, cameraEnabled, cleanup, onDataAvailable, onError])

  const stopRecording = useCallback(() => {
    console.log('[RECORDER] ⏹️ Deteniendo...')
    if (intervalRef.current) { cancelAnimationFrame(intervalRef.current); intervalRef.current = null }
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    
    streamsRef.current.screen?.getTracks().forEach(t => t.stop())
    streamsRef.current.camera?.getTracks().forEach(t => t.stop())
    streamsRef.current.audio?.getTracks().forEach(t => t.stop())
    combinedStreamRef.current?.getTracks().forEach(t => t.stop())
    
    combinedStreamRef.current = null
    mediaRecorderRef.current = null
    streamsRef.current = { screen: null, camera: null, audio: null }
    
    setState(prev => ({
      ...prev,
      isRecording: false,
      isPaused: false,
      screenStream: null,
      cameraStream: null,
      audioStream: null
    }))
  }, [])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause()
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      setState(prev => ({ ...prev, isPaused: true }))
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume()
      timerRef.current = window.setInterval(() => {
        setState(prev => ({ ...prev, recordingTime: prev.recordingTime + 1 }))
      }, 1000)
      setState(prev => ({ ...prev, isPaused: false }))
    }
  }, [])

  const togglePause = useCallback(() => {
    state.isPaused ? resumeRecording() : pauseRecording()
  }, [state.isPaused, pauseRecording, resumeRecording])

  return {
    ...state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    togglePause
  }
}

export default useMediaRecorder
