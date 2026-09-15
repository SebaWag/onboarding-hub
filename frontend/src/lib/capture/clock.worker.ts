/**
 * clock.worker.ts — Reloj maestro del pipeline de captura.
 *
 * ¿Por qué un worker y no rAF/setInterval del main thread?
 * Cuando la pestaña queda oculta (el caso normal al grabar: el usuario cambia
 * de ventana para mostrar otra app), el navegador PAUSA `requestAnimationFrame`
 * y ESTRANGULA `setInterval`/`setTimeout` del main thread a ~1 vez/segundo
 * (y a ~1 vez/minuto tras 5 min de "intensive throttling"). Eso congela el
 * canvas que alimenta la grabación.
 *
 * Los timers de un Web Worker NO sufren ese throttling. Por eso el "tick" de
 * captura nace aquí y se reenvía al main thread por mensaje (los handlers de
 * mensajes tampoco se estrangulan). El main thread pinta el frame y fuerza su
 * captura con `track.requestFrame()`.
 *
 * Referencia: Vanilagy (Mediabunny), discussion #78.
 */
type ClockMessage = { cmd: 'start'; intervalMs: number } | { cmd: 'stop' }

const ctx = self as unknown as Worker
let timer: ReturnType<typeof setInterval> | null = null

ctx.onmessage = (event: MessageEvent<ClockMessage>) => {
  const data = event.data
  if (data?.cmd === 'start') {
    if (timer !== null) clearInterval(timer)
    timer = setInterval(() => ctx.postMessage(0), Math.max(1, data.intervalMs))
  } else if (data?.cmd === 'stop') {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

export {}
