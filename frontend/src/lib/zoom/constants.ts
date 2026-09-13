// Constantes de timing y suavizado del motor de auto-zoom.
// Portado desde getopenscreen/openscreen (MIT) — src/lib/zoomMath/constants.ts
// y webadderallorg/Recordly (AGPL-3.0) — timeline/zoomSuggestionUtils.ts (valores/ideas).

import type { ZoomFocus } from './types'

export const DEFAULT_FOCUS: ZoomFocus = { cx: 0.5, cy: 0.5 }

// --- Ventanas de transición (zoom-in es más lento que zoom-out) ---
export const TRANSITION_WINDOW_MS = 1015.05
export const ZOOM_IN_TRANSITION_WINDOW_MS = TRANSITION_WINDOW_MS * 1.5
export const ZOOM_IN_OVERLAP_MS = 500

export const SMOOTHING_FACTOR = 0.12
export const ZOOM_TRANSLATION_DEADZONE_PX = 1.25
export const ZOOM_SCALE_DEADZONE = 0.002

// --- Follow-camera automático (frame-rate independent) ---
export const AUTO_FOLLOW_SMOOTHING_FACTOR = 0.1
export const AUTO_FOLLOW_SMOOTHING_FACTOR_MAX = 0.25
export const AUTO_FOLLOW_RAMP_DISTANCE = 0.15
/** Referencia de frame para normalizar preview y export (40 fps). */
export const AUTO_FOLLOW_REFERENCE_MS = 1000 / 40

export const AUTO_FOLLOW_PARAMS = {
  minFactor: AUTO_FOLLOW_SMOOTHING_FACTOR,
  maxFactor: AUTO_FOLLOW_SMOOTHING_FACTOR_MAX,
  rampDistance: AUTO_FOLLOW_RAMP_DISTANCE,
  referenceMs: AUTO_FOLLOW_REFERENCE_MS,
} as const

// --- Detección de regiones de zoom (dwell / clicks) ---
export const MIN_DWELL_DURATION_MS = 450
export const MAX_DWELL_DURATION_MS = 2600
/** Distancia normalizada por debajo de la cual el cursor se considera "quieto". */
export const DWELL_MOVE_THRESHOLD = 0.02

/** Clicks separados menos que esto se fusionan en un mismo cluster. */
export const CLICK_CLUSTER_MERGE_GAP_MS = 2500
/** Padding antes del primer click y después del último del cluster. */
export const CLICK_CLUSTER_PAD_MS = 500

// --- Chained zoom-pan entre regiones cercanas ---
export const CHAINED_ZOOM_PAN_GAP_MS = 1500
export const CONNECTED_ZOOM_PAN_DURATION_MS = 1000

// --- Zona segura del follow-camera (ratio de inset por borde) ---
export const SNAP_TO_EDGES_RATIO_MANUAL = 0.25
export const SNAP_TO_EDGES_RATIO_AUTO = 0.25
