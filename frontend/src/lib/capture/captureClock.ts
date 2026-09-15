/**
 * CaptureClock — reloj maestro para el pipeline de captura de video.
 *
 * PROBLEMA QUE RESUELVE (raíz):
 * Con la pestaña oculta, `requestAnimationFrame` no dispara y los timers del
 * main thread se estrangulan a ~1 Hz. Un canvas que se actualiza con rAF o
 * setInterval deja de emitir frames → la grabación queda como "fotos pegadas".
 *
 * SOLUCIÓN:
 * El tick lo genera un Web Worker (sus timers no se estrangulan en background)
 * y despierta al main thread por `postMessage`. El main thread pinta el frame y
 * llama `CanvasCaptureMediaStreamTrack.requestFrame()` para forzar su captura.
 *
 * Si `Worker` no está disponible (p. ej. tests en Node), cae a un `setInterval`
 * del main thread para no romper la ejecución.
 */
export class CaptureClock {
  private worker: Worker | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private onTick: (() => void) | null = null
  private frames = 0

  /** Cantidad de ticks emitidos desde el último `start` (telemetría/diagnóstico). */
  get frameCount(): number {
    return this.frames
  }

  get isRunning(): boolean {
    return this.worker !== null || this.timer !== null
  }

  start(fps: number, onTick: () => void): void {
    this.stop()
    this.onTick = onTick
    this.frames = 0
    const intervalMs = Math.max(1, Math.round(1000 / fps))

    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./clock.worker.ts', import.meta.url), { type: 'module' })
        this.worker.onmessage = () => this.emit()
        this.worker.postMessage({ cmd: 'start', intervalMs })
        return
      } catch (err) {
        console.warn('[CaptureClock] Worker no disponible, usando setInterval del main thread:', err)
        this.worker = null
      }
    }

    // Fallback: sin Worker no hay forma de evitar el throttling, pero al menos
    // el pipeline sigue funcionando (p. ej. en entornos sin Web Workers).
    this.timer = setInterval(() => this.emit(), intervalMs)
  }

  stop(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ cmd: 'stop' })
      } catch {
        // noop: el worker puede estar ya terminado
      }
      this.worker.terminate()
      this.worker = null
    }
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.onTick = null
  }

  private emit(): void {
    this.frames++
    this.onTick?.()
  }
}
