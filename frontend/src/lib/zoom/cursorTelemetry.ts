// Captura de telemetría del cursor durante la grabación.
// Ver spec: ~/shiva/specs/auto-zoom-onboarding-hub.md

import { clamp01 } from './mathUtils'
import type { CursorInteractionType, CursorTelemetryPoint, ZoomFocus } from './types'

/** Throttle de muestras de movimiento (ms) — evita miles de muestras por segundo. */
const MOVE_SAMPLE_INTERVAL_MS = 16

/**
 * Registra posición + interacciones del cursor mientras corre.
 *
 * LIMITACIÓN CONOCIDA (web): los eventos `mousemove`/`click` solo llegan cuando el
 * puntero está sobre NUESTRA página. Al grabar otras ventanas/apps no hay eventos,
 * así que se marca el cursor como "fuera" y el auto-zoom se retira con gracia en
 * lugar de quedarse pegado a una posición vieja.
 *
 * Coordenadas: normalizadas 0..1 respecto al monitor (best-effort, usando
 * `window.screenX/screenY + clientX/clientY` sobre `screen.width/height`).
 */
export class CursorTelemetryRecorder {
  private samples: CursorTelemetryPoint[] = []
  private startedAt = 0
  private running = false
  private inside = false
  private lastMoveRecordedMs = -Infinity
  private readonly maxSamples: number

  constructor(maxSamples = 60000) {
    this.maxSamples = maxSamples
  }

  start(): void {
    if (this.running) return
    this.samples = []
    this.inside = false
    this.lastMoveRecordedMs = -Infinity
    this.startedAt = performance.now()
    this.running = true
    window.addEventListener('mousemove', this.onMove, { passive: true })
    window.addEventListener('mousedown', this.onPrimary, { passive: true })
    window.addEventListener('dblclick', this.onDouble, { passive: true })
    window.addEventListener('blur', this.onLeave)
    document.addEventListener('mouseleave', this.onLeave)
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.inside = false
    window.removeEventListener('mousemove', this.onMove)
    window.removeEventListener('mousedown', this.onPrimary)
    window.removeEventListener('dblclick', this.onDouble)
    window.removeEventListener('blur', this.onLeave)
    document.removeEventListener('mouseleave', this.onLeave)
  }

  isRunning(): boolean {
    return this.running
  }

  /** Tiempo transcurrido desde el inicio de la captura, en ms. */
  now(): number {
    return this.running ? performance.now() - this.startedAt : 0
  }

  getSamples(): CursorTelemetryPoint[] {
    return this.samples
  }

  /** ¿El puntero está actualmente dentro de nuestra página? */
  isCursorInside(): boolean {
    return this.inside
  }

  /** Última posición conocida del cursor como foco normalizado. */
  getCursorFocus(): ZoomFocus | null {
    const last = this.samples[this.samples.length - 1]
    return last ? { cx: last.cx, cy: last.cy } : null
  }

  private toNormalized(e: MouseEvent): ZoomFocus {
    const screenW = window.screen?.width || window.innerWidth || 1
    const screenH = window.screen?.height || window.innerHeight || 1
    const originX = window.screenX ?? window.screenLeft ?? 0
    const originY = window.screenY ?? window.screenTop ?? 0
    return {
      cx: clamp01((originX + e.clientX) / screenW),
      cy: clamp01((originY + e.clientY) / screenH),
    }
  }

  private record(e: MouseEvent, interactionType: CursorInteractionType): void {
    if (!this.running) return
    const { cx, cy } = this.toNormalized(e)
    this.samples.push({ timeMs: this.now(), cx, cy, interactionType })
    this.thinIfNeeded()
  }

  /** Si el buffer crece demasiado, descarta 1 de cada 2 muestras (baja resolución). */
  private thinIfNeeded(): void {
    if (this.samples.length <= this.maxSamples) return
    const thinned: CursorTelemetryPoint[] = []
    for (let i = 0; i < this.samples.length; i += 2) thinned.push(this.samples[i])
    this.samples = thinned
  }

  private onMove = (e: MouseEvent): void => {
    if (!this.running) return
    this.inside = true
    const now = this.now()
    if (now - this.lastMoveRecordedMs < MOVE_SAMPLE_INTERVAL_MS) return
    this.lastMoveRecordedMs = now
    this.record(e, 'move')
  }

  private onPrimary = (e: MouseEvent): void => {
    this.inside = true
    this.record(e, 'click')
  }

  private onDouble = (e: MouseEvent): void => {
    this.inside = true
    this.record(e, 'double-click')
  }

  private onLeave = (): void => {
    this.inside = false
  }
}
