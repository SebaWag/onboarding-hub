// Preview de zoom en reproducción: convierte regiones guardadas → transform CSS.
//
// Reutiliza la geometría del motor (escala por depth, easing de Screen Studio) para
// que el preview se vea igual que el zoom en vivo. NO re-encodea: solo aplica un
// `transform` al <video> durante el playback.
//
// Ver: ~/shiva/specs/auto-zoom-onboarding-hub.md

import { ZOOM_IN_OVERLAP_MS, ZOOM_IN_TRANSITION_WINDOW_MS, TRANSITION_WINDOW_MS } from './constants'
import { interpolateCursorAt } from './cursorFollowUtils'
import { clamp01, easeOutScreenStudio } from './mathUtils'
import { ZOOM_DEPTH_SCALES, clampFocus, type CursorTelemetryPoint, type ZoomRegion } from './types'

/**
 * Fuerza (0..1) de una región en un instante dado.
 * Rampa de entrada solapada al inicio, meseta en la región y rampa de salida.
 */
export function computeRegionStrength(
  region: ZoomRegion,
  timeMs: number,
  playbackRate = 1,
): number {
  const zoomInWindow = ZOOM_IN_TRANSITION_WINDOW_MS * playbackRate
  const zoomOutWindow = TRANSITION_WINDOW_MS * playbackRate
  const zoomInEnd = region.startMs + ZOOM_IN_OVERLAP_MS
  const leadInStart = zoomInEnd - zoomInWindow
  const leadOutEnd = region.endMs + zoomOutWindow

  if (timeMs < leadInStart || timeMs > leadOutEnd) return 0

  if (timeMs < zoomInEnd) {
    const progress = (timeMs - leadInStart) / zoomInWindow
    return easeOutScreenStudio(progress)
  }

  if (timeMs <= region.endMs) return 1

  const progress = clamp01((timeMs - region.endMs) / zoomOutWindow)
  return 1 - easeOutScreenStudio(progress)
}

export interface ZoomFrame {
  /** Escala objetivo según la profundidad de la región (1.25 .. 5). */
  zoomScale: number
  focusX: number
  focusY: number
  /** Fuerza de la transición en este instante (0..1). */
  strength: number
}

/**
 * Frame de zoom para un instante: elige la región activa más fuerte.
 *
 * Si la región es `auto` y hay telemetría, el foco SIGUE al cursor (la cámara se
 * centra siempre donde está la acción) en vez de quedarse en un punto fijo.
 * Devuelve null si ninguna región está activa.
 */
export function computeZoomFrame(
  regions: ZoomRegion[],
  timeMs: number,
  telemetry?: CursorTelemetryPoint[] | null,
): ZoomFrame | null {
  let bestRegion: ZoomRegion | null = null
  let bestStrength = 0

  for (const region of regions) {
    const strength = computeRegionStrength(region, timeMs)
    if (strength <= 0) continue
    if (strength > bestStrength) {
      bestStrength = strength
      bestRegion = region
    }
  }

  if (!bestRegion) return null

  let focus = clampFocus(bestRegion.focus)
  if (bestRegion.mode === 'auto' && telemetry && telemetry.length > 1) {
    const cursor = interpolateCursorAt(telemetry, timeMs)
    if (cursor) focus = clampFocus(cursor)
  }

  return {
    zoomScale: ZOOM_DEPTH_SCALES[bestRegion.depth] ?? 1,
    focusX: focus.cx,
    focusY: focus.cy,
    strength: bestStrength,
  }
}

export interface CssZoomTransform {
  /** Valor para la propiedad `transform`. `none` cuando no hay zoom activo. */
  transform: string
  transformOrigin: string
  active: boolean
}

/**
 * Convierte un frame de zoom a un `transform` CSS sobre el <video>.
 *
 * Se expresa en % (relativo al tamaño del elemento), así que no necesita medir
 * píxeles. Con `transform-origin: 0 0` y orden translate→scale, la fórmula
 * equivale a `computeZoomTransform` sobre un stage de 100×100:
 *   scale = 1 + (zoomScale - 1) * strength
 *   tx%   = (50 - 100 * focusX * zoomScale) * strength
 *   ty%   = (50 - 100 * focusY * zoomScale) * strength
 */
export function zoomFrameToCss(frame: ZoomFrame | null): CssZoomTransform {
  if (!frame || frame.strength <= 0) {
    return { transform: 'none', transformOrigin: '0 0', active: false }
  }

  const scale = 1 + (frame.zoomScale - 1) * frame.strength
  const tx = (50 - 100 * frame.focusX * frame.zoomScale) * frame.strength
  const ty = (50 - 100 * frame.focusY * frame.zoomScale) * frame.strength

  return {
    transform: `translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%) scale(${scale.toFixed(4)})`,
    transformOrigin: '0 0',
    active: true,
  }
}
