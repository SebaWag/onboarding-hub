// Tipos del motor de auto-zoom.
// Portado desde getopenscreen/openscreen (MIT) + webadderallorg/Recordly (AGPL-3.0).
// Solo se reutilizan los TIPOS / ideas de Recordly (no código copiado).

import { clamp01 } from './mathUtils'

/** Punto de foco normalizado (0..1) sobre el stage/canvas. */
export interface ZoomFocus {
  cx: number
  cy: number
}

export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6

export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
  1: 1.25,
  2: 1.5,
  3: 1.8,
  4: 2.2,
  5: 3.5,
  6: 5.0,
}

export const MIN_ZOOM_SCALE = 1.0
export const MAX_ZOOM_SCALE = 5.0

/** Zoom manual por defecto. */
export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 3
/** Zoom automático por defecto (más sutil). */
export const DEFAULT_AUTO_ZOOM_DEPTH: ZoomDepth = 3

export interface ViewportRatio {
  widthRatio: number
  heightRatio: number
}

/** Un foco desconocido significa "centro", nunca "esquina". */
function focusOrCentre(value: number): number {
  return Number.isFinite(value) ? clamp01(value) : 0.5
}

export function clampFocus(focus: ZoomFocus): ZoomFocus {
  return {
    cx: focusOrCentre(focus.cx),
    cy: focusOrCentre(focus.cy),
  }
}

export function getZoomScale(depth: ZoomDepth): number {
  return ZOOM_DEPTH_SCALES[depth]
}

export type CursorInteractionType =
  | 'move'
  | 'click'
  | 'double-click'
  | 'right-click'
  | 'middle-click'
  | 'mouseup'

export type CursorType =
  | 'arrow'
  | 'text'
  | 'pointer'
  | 'crosshair'
  | 'open-hand'
  | 'closed-hand'
  | 'resize-ew'
  | 'resize-ns'
  | 'not-allowed'

/** Punto de telemetría del cursor capturado durante la grabación. */
export interface CursorTelemetryPoint {
  timeMs: number
  cx: number
  cy: number
  pressure?: number
  interactionType?: CursorInteractionType
  cursorType?: CursorType
}

export type ZoomMode = 'auto' | 'manual'

/** Región de zoom: cuándo, cuánto y dónde. Se persiste junto al video. */
export interface ZoomRegion {
  id: string
  startMs: number
  endMs: number
  depth: ZoomDepth
  focus: ZoomFocus
  mode?: ZoomMode
}
