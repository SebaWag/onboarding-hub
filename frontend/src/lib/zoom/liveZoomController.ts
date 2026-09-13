// Controlador de cámara automática EN VIVO.
//
// Traduce telemetría de cursor → transform de zoom (scale + translate) suavizado
// con spring, listo para aplicar en el `ctx.drawImage` de la grabadora.
//
// Comportamiento (POC):
//   - click / doble-click      → hace zoom al punto y lo mantiene `holdMs`
//   - cursor quieto (dwell)    → hace zoom al punto una vez tras `minDwellMs`
//   - cursor fuera / null      → se retira suavemente a la vista completa
//
// Reutiliza el motor de `lib/zoom/` (spring, follow, geometría). Ver spec.

import { AUTO_FOLLOW_PARAMS, DWELL_MOVE_THRESHOLD, MIN_DWELL_DURATION_MS } from './constants'
import { advanceFollowFocus } from './cursorFollowUtils'
import { clampFocusToScale } from './focusUtils'
import { createZoomSpringState, resetZoomSpring, stepZoomSpring, type ZoomTransform } from './zoomSpring'
import { computeZoomTransform } from './zoomTransform'
import {
  ZOOM_DEPTH_SCALES,
  type CursorTelemetryPoint,
  type ZoomDepth,
  type ZoomFocus,
} from './types'

export interface LiveZoomOptions {
  depth: ZoomDepth
  stageSize: { width: number; height: number }
  /** Tiempo que se mantiene el zoom tras una interacción (ms). */
  holdMs?: number
  /** Tiempo de quietud para disparar zoom por dwell (ms). */
  minDwellMs?: number
  /** Distancia normalizada para considerar que el cursor "se movió". */
  moveThreshold?: number
}

const IDENTITY: ZoomTransform = { scale: 1, x: 0, y: 0 }
/** Cap de dt para que una pausa larga no dispare un salto del spring. */
const MAX_DT_MS = 80

export class LiveZoomController {
  private readonly depthScale: number
  private readonly stageSize: { width: number; height: number }
  private readonly baseMask: { x: number; y: number; width: number; height: number }
  private readonly holdMs: number
  private readonly minDwellMs: number
  private readonly moveThreshold: number

  private readonly spring = createZoomSpringState()
  private focus: ZoomFocus = { cx: 0.5, cy: 0.5 }
  private activeUntilMs = 0
  private lastMoveMs = 0
  private lastMoveFocus: ZoomFocus | null = null
  private dwellFired = false
  private lastFrameMs = 0
  private primed = false

  constructor(opts: LiveZoomOptions) {
    this.depthScale = ZOOM_DEPTH_SCALES[opts.depth]
    this.stageSize = opts.stageSize
    this.baseMask = { x: 0, y: 0, width: opts.stageSize.width, height: opts.stageSize.height }
    this.holdMs = opts.holdMs ?? 2600
    this.minDwellMs = opts.minDwellMs ?? MIN_DWELL_DURATION_MS
    this.moveThreshold = opts.moveThreshold ?? DWELL_MOVE_THRESHOLD
  }

  reset(): void {
    resetZoomSpring(this.spring, IDENTITY)
    this.focus = { cx: 0.5, cy: 0.5 }
    this.activeUntilMs = 0
    this.lastMoveFocus = null
    this.dwellFired = false
    this.primed = false
  }

  /** Registra una muestra de telemetría. Dispara/renueva el zoom en interacciones. */
  ingest(point: CursorTelemetryPoint): void {
    const focus: ZoomFocus = { cx: point.cx, cy: point.cy }

    if (point.interactionType && point.interactionType !== 'move') {
      // Interacción explícita (click / doble-click): zoom inmediato y renovado.
      this.activeUntilMs = point.timeMs + this.holdMs
      this.focus = focus
      this.lastMoveMs = point.timeMs
      this.lastMoveFocus = focus
      this.dwellFired = false
      return
    }

    // Movimiento: solo cuenta como "se movió" si supera el umbral.
    if (!this.lastMoveFocus) {
      this.lastMoveFocus = focus
      this.lastMoveMs = point.timeMs
      return
    }

    const distance = Math.hypot(focus.cx - this.lastMoveFocus.cx, focus.cy - this.lastMoveFocus.cy)
    if (distance > this.moveThreshold) {
      this.lastMoveFocus = focus
      this.lastMoveMs = point.timeMs
      this.dwellFired = false
    }
  }

  /**
   * Transform suavizado para el frame actual.
   * `cursor` = foco actual, o `null` si el cursor está fuera (→ se retira el zoom).
   */
  frame(timeMs: number, cursor: ZoomFocus | null): ZoomTransform {
    const dtMs = this.primed ? Math.min(MAX_DT_MS, Math.max(0, timeMs - this.lastFrameMs)) : 0
    this.lastFrameMs = timeMs

    if (!this.primed) {
      this.primed = true
      resetZoomSpring(this.spring, IDENTITY)
    }

    // Cursor fuera → soltar el zoom y volver a la vista completa.
    if (!cursor) {
      this.activeUntilMs = 0
      return stepZoomSpring(this.spring, IDENTITY, dtMs)
    }

    // Dwell: cursor quieto el tiempo suficiente → zoom único al punto.
    if (!this.dwellFired && this.lastMoveFocus && timeMs - this.lastMoveMs >= this.minDwellMs) {
      this.activeUntilMs = timeMs + this.holdMs
      this.dwellFired = true
      this.focus = this.lastMoveFocus
    }

    const zoomed = timeMs < this.activeUntilMs
    if (!zoomed) {
      return stepZoomSpring(this.spring, IDENTITY, dtMs)
    }

    const clamped = clampFocusToScale(cursor, this.depthScale)
    this.focus = advanceFollowFocus(this.focus, clamped, dtMs, { ...AUTO_FOLLOW_PARAMS })

    const geo = computeZoomTransform({
      stageSize: this.stageSize,
      baseMask: this.baseMask,
      zoomScale: this.depthScale,
      zoomProgress: 1,
      focusX: this.focus.cx,
      focusY: this.focus.cy,
    })

    return stepZoomSpring(this.spring, { scale: geo.scale, x: geo.x, y: geo.y }, dtMs)
  }
}
