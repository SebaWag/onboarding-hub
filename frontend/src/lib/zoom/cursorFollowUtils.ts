// Utilidades de follow-cursor: interpolación + smoothing adaptativo.
// Portado desde getopenscreen/openscreen (MIT) — src/lib/zoomMath/cursorFollowUtils.ts
// (idéntico en Recordly, AGPL) — se usa la versión MIT de OpenScreen.

import type { CursorTelemetryPoint, ZoomFocus } from './types'

/**
 * Búsqueda binaria sobre la telemetría ordenada + interpolación lineal de la
 * posición del cursor en el tiempo de reproducción dado.
 */
export function interpolateCursorAt(
  telemetry: CursorTelemetryPoint[],
  timeMs: number,
): ZoomFocus | null {
  if (telemetry.length === 0) return null

  if (timeMs <= telemetry[0].timeMs) {
    return { cx: telemetry[0].cx, cy: telemetry[0].cy }
  }

  const last = telemetry[telemetry.length - 1]
  if (timeMs >= last.timeMs) {
    return { cx: last.cx, cy: last.cy }
  }

  let lo = 0
  let hi = telemetry.length - 1

  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1
    if (telemetry[mid].timeMs <= timeMs) {
      lo = mid
    } else {
      hi = mid
    }
  }

  const before = telemetry[lo]
  const after = telemetry[hi]
  const span = after.timeMs - before.timeMs
  const t = span > 0 ? (timeMs - before.timeMs) / span : 0

  return {
    cx: before.cx + (after.cx - before.cx) * t,
    cy: before.cy + (after.cy - before.cy) * t,
  }
}

/**
 * Smoothing exponencial para reducir el jitter de datos de cursor de alta
 * frecuencia. Factor menor = más suave/con más lag; mayor = más responsivo.
 */
export function smoothCursorFocus(raw: ZoomFocus, prev: ZoomFocus, factor: number): ZoomFocus {
  return {
    cx: prev.cx + (raw.cx - prev.cx) * factor,
    cy: prev.cy + (raw.cy - prev.cy) * factor,
  }
}

export interface FollowParams {
  minFactor: number
  maxFactor: number
  rampDistance: number
  referenceMs: number
}

/**
 * Hace que un factor de smoothing por-frame sea independiente del frame-rate,
 * reencuadrándolo en tiempo de contenido. La cámara converge como
 * `(1 - base)^(dtMs / referenceMs)` sin importar cómo se trocee el render, así
 * preview (fps variable) y export (fps fijo) siguen a la misma velocidad.
 * Devuelve 0 en pausa para que la cámara se quede quieta.
 */
export function timeCorrectedFollowFactor(
  baseFactor: number,
  dtMs: number,
  referenceMs: number,
): number {
  if (!(dtMs > 0) || !(referenceMs > 0)) return 0
  return 1 - (1 - baseFactor) ** (dtMs / referenceMs)
}

/**
 * Factor de smoothing adaptativo que escala con la distancia: lejos del target =
 * más rápido (maxFactor), cerca = más lento (minFactor). Reemplaza el deadzone
 * duro por una curva de desaceleración natural.
 */
export function adaptiveSmoothFactor(
  raw: ZoomFocus,
  prev: ZoomFocus,
  minFactor: number,
  maxFactor: number,
  rampDistance: number,
): number {
  const dx = raw.cx - prev.cx
  const dy = raw.cy - prev.cy
  const distance = Math.sqrt(dx * dx + dy * dy)
  const t = Math.min(1, distance / rampDistance)
  return minFactor + (maxFactor - minFactor) * t
}

/**
 * Avanza el foco del auto-follow desde `prev` hacia `raw` durante `dtMs` de
 * tiempo de contenido. Devuelve `prev` sin cambios en pausa.
 */
export function advanceFollowFocus(
  prev: ZoomFocus,
  raw: ZoomFocus,
  dtMs: number,
  params: FollowParams,
): ZoomFocus {
  if (!(dtMs > 0)) return prev
  const base = adaptiveSmoothFactor(
    raw,
    prev,
    params.minFactor,
    params.maxFactor,
    params.rampDistance,
  )
  const factor = timeCorrectedFollowFactor(base, dtMs, params.referenceMs)
  return smoothCursorFocus(raw, prev, factor)
}
