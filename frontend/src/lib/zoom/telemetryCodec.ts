// Compresión de telemetría de cursor antes de enviarla al backend.
//
// El endpoint JSON del backend tiene un límite de body de 1MB, así que una
// grabación larga a ~60 muestras/s no cabe. Comprimimos conservando SIEMPRE las
// interacciones (clicks) y adelgazando uniformemente las muestras de movimiento.

import type { CursorTelemetryPoint } from './types'

/** Presupuesto de muestras por defecto (≈ por debajo de 1MB de JSON). */
export const DEFAULT_MAX_TELEMETRY_SAMPLES = 12_000

function isInteraction(sample: CursorTelemetryPoint): boolean {
  return typeof sample.interactionType === 'string' && sample.interactionType !== 'move'
}

/** Deja solo los campos relevantes (descarta cursorType/pressure para ahorrar bytes). */
function slim(sample: CursorTelemetryPoint): CursorTelemetryPoint {
  const out: CursorTelemetryPoint = {
    timeMs: Math.max(0, Math.round(sample.timeMs)),
    cx: sample.cx,
    cy: sample.cy,
  }
  if (typeof sample.interactionType === 'string') out.interactionType = sample.interactionType
  return out
}

/**
 * Comprime la telemetría a lo sumo `maxSamples` muestras:
 *  - conserva TODAS las interacciones (clicks/doble-clicks)
 *  - adelgaza uniformemente las muestras de movimiento restantes
 *  - devuelve el resultado ordenado por tiempo
 */
export function compressTelemetry(
  samples: CursorTelemetryPoint[],
  maxSamples: number = DEFAULT_MAX_TELEMETRY_SAMPLES,
): CursorTelemetryPoint[] {
  const clean = samples
    .filter((s) => Number.isFinite(s.timeMs) && Number.isFinite(s.cx) && Number.isFinite(s.cy))
    .map(slim)
    .sort((a, b) => a.timeMs - b.timeMs)

  if (clean.length <= maxSamples) return clean

  const interactions = clean.filter(isInteraction)
  const moves = clean.filter((s) => !isInteraction(s))
  const moveBudget = Math.max(0, maxSamples - interactions.length)

  if (moveBudget === 0) return interactions

  const step = moves.length / moveBudget
  const pickedMoves: CursorTelemetryPoint[] = []
  for (let i = 0; i < moveBudget; i += 1) {
    pickedMoves.push(moves[Math.min(moves.length - 1, Math.floor(i * step))])
  }

  return [...interactions, ...pickedMoves].sort((a, b) => a.timeMs - b.timeMs)
}
