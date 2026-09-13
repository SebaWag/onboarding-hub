// Motor de SUGERENCIA de regiones de zoom a partir de telemetría de cursor.
//
// Idea reimplementada desde webadderallorg/Recordly (AGPL-3.0) — NO se copió
// código; se usan los umbrales/ideas documentados en el spec. Todo puro y testeable.
//
// Ver: ~/shiva/specs/auto-zoom-onboarding-hub.md

import { clamp, clamp01 } from './mathUtils'
import {
  CLICK_CLUSTER_MERGE_GAP_MS,
  CLICK_CLUSTER_PAD_MS,
  DWELL_MOVE_THRESHOLD,
  MAX_DWELL_DURATION_MS,
  MIN_DWELL_DURATION_MS,
} from './constants'
import { DEFAULT_AUTO_ZOOM_DEPTH, type CursorInteractionType, type CursorTelemetryPoint, type ZoomDepth, type ZoomFocus, type ZoomRegion } from './types'

/** Fuerza base por tipo de interacción explícita. */
const CLICK_STRENGTH = 900
const DOUBLE_CLICK_STRENGTH = 1500
const DWELL_TEXT_STRENGTH = 1100
const DWELL_SHORT_STRENGTH = 800

/** Distancia normalizada para considerar dos candidatos "en el mismo lugar". */
export const DEFAULT_MERGE_DISTANCE = 0.18
/** Duración mínima de una región sugerida (ms). */
export const DEFAULT_MIN_REGION_MS = 700
/** Máximo de regiones sugeridas (evita "zoom spam"). */
export const DEFAULT_MAX_REGIONS = 40

export type ZoomCandidateKind = 'dwell' | 'click' | 'double-click' | 'text-focus' | 'activity'

export interface ZoomDwellCandidate {
  centerTimeMs: number
  focus: ZoomFocus
  /** Duración de la quietud (ms) o medida de actividad. */
  strength: number
  /** Inicio del tramo (ms) — permite que la región cubra toda la ráfaga. */
  spanStartMs?: number
  /** Fin del tramo (ms). */
  spanEndMs?: number
}

export interface ZoomInteractionCandidate extends ZoomDwellCandidate {
  kind: ZoomCandidateKind
  source: 'explicit' | 'heuristic'
}

export interface SuggestZoomOptions {
  depth?: ZoomDepth
  /** Gap máximo entre candidatos para fusionarlos en una misma región. */
  mergeGapMs?: number
  /** Padding antes/después del cluster. */
  padMs?: number
  /** Distancia normalizada máxima para fusionar candidatos. */
  mergeDistance?: number
  /** Máximo de regiones sugeridas. */
  maxRegions?: number
  /** Duración mínima de cada región. */
  minDurationMs?: number
}

function isExplicitClick(type: CursorInteractionType | undefined): boolean {
  return (
    type === 'click' ||
    type === 'double-click' ||
    type === 'right-click' ||
    type === 'middle-click'
  )
}

/** Limpia y ordena la telemetría (filtra NaN, clampa y ordena por tiempo). */
export function sanitizeTelemetry(
  samples: CursorTelemetryPoint[],
  totalMs: number,
): CursorTelemetryPoint[] {
  const limit = Number.isFinite(totalMs) && totalMs > 0 ? totalMs : Number.MAX_SAFE_INTEGER
  return samples
    .filter((s) => Number.isFinite(s.timeMs) && Number.isFinite(s.cx) && Number.isFinite(s.cy))
    .map((s) => ({
      ...s,
      timeMs: clamp(s.timeMs, 0, limit),
      cx: clamp01(s.cx),
      cy: clamp01(s.cy),
    }))
    .sort((a, b) => a.timeMs - b.timeMs)
}

/**
 * Detecta "quedadas" (dwell): tramos donde el cursor se mantiene casi quieto.
 * Un tramo es candidato si su duración está en [MIN, MAX] de dwell.
 */
export function detectDwellCandidates(samples: CursorTelemetryPoint[]): ZoomDwellCandidate[] {
  if (samples.length < 2) return []

  const candidates: ZoomDwellCandidate[] = []
  let runStart = 0

  const pushRun = (startIndex: number, endExclusive: number) => {
    if (endExclusive - startIndex < 2) return
    const start = samples[startIndex]
    const end = samples[endExclusive - 1]
    const duration = end.timeMs - start.timeMs
    if (duration < MIN_DWELL_DURATION_MS || duration > MAX_DWELL_DURATION_MS) return

    const run = samples.slice(startIndex, endExclusive)
    const avgCx = run.reduce((sum, s) => sum + s.cx, 0) / run.length
    const avgCy = run.reduce((sum, s) => sum + s.cy, 0) / run.length

    candidates.push({
      centerTimeMs: Math.round((start.timeMs + end.timeMs) / 2),
      focus: { cx: avgCx, cy: avgCy },
      strength: duration,
    })
  }

  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1]
    const curr = samples[i]
    const distance = Math.hypot(curr.cx - prev.cx, curr.cy - prev.cy)
    if (distance > DWELL_MOVE_THRESHOLD) {
      pushRun(runStart, i)
      runStart = i
    }
  }
  pushRun(runStart, samples.length)

  return candidates
}

/** Gap entre muestras (ms) que separa dos ráfagas de actividad distintas. */
export const ACTIVITY_GAP_MS = 800
/** Duración mínima de una ráfaga para ser candidata. */
export const MIN_BURST_DURATION_MS = 250
/** Longitud de camino normalizada mínima para considerar la ráfaga actividad real. */
export const MIN_BURST_PATH = 0.06
/** Mínimo de muestras de una ráfaga: evita contar "teletransportes" (2 muestras) como actividad. */
export const MIN_BURST_SAMPLES = 4

/**
 * Detecta RÁFAGAS DE ACTIVIDAD: tramos con movimiento continuo del cursor.
 *
 * Es el complemento que faltaba: clicks/dwells dejan fuera los tramos donde el
 * usuario simplemente se mueve o navega por la pantalla (lo más común en un
 * tutorial). Cada ráfaga genera una región que cubre todo su span.
 */
export function detectActivityBursts(samples: CursorTelemetryPoint[]): ZoomInteractionCandidate[] {
  if (samples.length < 2) return []

  const out: ZoomInteractionCandidate[] = []
  let start = 0

  const pushBurst = (from: number, toExclusive: number) => {
    if (toExclusive - from < MIN_BURST_SAMPLES) return
    const run = samples.slice(from, toExclusive)
    const fromMs = run[0].timeMs
    const toMs = run[run.length - 1].timeMs
    const duration = toMs - fromMs
    if (duration < MIN_BURST_DURATION_MS) return

    let path = 0
    for (let i = 1; i < run.length; i += 1) {
      path += Math.hypot(run[i].cx - run[i - 1].cx, run[i].cy - run[i - 1].cy)
    }
    if (path < MIN_BURST_PATH) return

    const cx = run.reduce((sum, p) => sum + p.cx, 0) / run.length
    const cy = run.reduce((sum, p) => sum + p.cy, 0) / run.length

    out.push({
      centerTimeMs: Math.round((fromMs + toMs) / 2),
      focus: { cx, cy },
      strength: path * 1000 + duration,
      kind: 'activity',
      source: 'heuristic',
      spanStartMs: fromMs,
      spanEndMs: toMs,
    })
  }

  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].timeMs - samples[i - 1].timeMs > ACTIVITY_GAP_MS) {
      pushBurst(start, i)
      start = i
    }
  }
  pushBurst(start, samples.length)

  return out
}

/** Detecta interacciones relevantes: clicks explícitos + quedadas (dwell). */
export function detectInteractionCandidates(
  samples: CursorTelemetryPoint[],
): ZoomInteractionCandidate[] {
  const explicit: ZoomInteractionCandidate[] = []

  for (const sample of samples) {
    if (!isExplicitClick(sample.interactionType)) continue
    const isDouble = sample.interactionType === 'double-click'
    explicit.push({
      centerTimeMs: Math.round(sample.timeMs),
      focus: { cx: sample.cx, cy: sample.cy },
      strength: isDouble ? DOUBLE_CLICK_STRENGTH : CLICK_STRENGTH,
      kind: isDouble ? 'double-click' : 'click',
      source: 'explicit',
    })
  }

  const dwells = detectDwellCandidates(samples).map<ZoomInteractionCandidate>((c) => {
    const kind: ZoomCandidateKind =
      c.strength >= DWELL_TEXT_STRENGTH
        ? 'text-focus'
        : c.strength <= DWELL_SHORT_STRENGTH
          ? 'click'
          : 'dwell'
    return { ...c, kind, source: 'heuristic' }
  })

  // Nota: NO sintetizamos doble-clicks desde dwells. Nuestra telemetría web captura
  // los clicks de forma explícita (mousedown/dblclick), y con MIN_DWELL=450ms dos
  // dwells jamás quedan a <450ms entre centros → sería código inalcanzable.
  return [...explicit, ...dwells]
}

interface Cluster {
  firstMs: number
  lastMs: number
  totalStrength: number
  weightedX: number
  weightedY: number
  focus: ZoomFocus
}

/**
 * Genera regiones de zoom sugeridas a partir de la telemetría.
 *
 * 1) detecta candidatos (clicks + dwells)
 * 2) los agrupa por cercanía temporal y espacial
 * 3) calcula start/end (con padding) y el foco ponderado por fuerza
 * 4) cap a `maxRegions` (las más fuertes) y ordena por tiempo
 */
export function suggestZoomRegions(
  samples: CursorTelemetryPoint[],
  totalMs: number,
  options: SuggestZoomOptions = {},
): ZoomRegion[] {
  const depth = options.depth ?? DEFAULT_AUTO_ZOOM_DEPTH
  const mergeGapMs = options.mergeGapMs ?? CLICK_CLUSTER_MERGE_GAP_MS
  const padMs = options.padMs ?? CLICK_CLUSTER_PAD_MS
  const mergeDistance = options.mergeDistance ?? DEFAULT_MERGE_DISTANCE
  const maxRegions = options.maxRegions ?? DEFAULT_MAX_REGIONS
  const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_REGION_MS

  const clean = sanitizeTelemetry(samples, totalMs)
  const candidates = [
    ...detectInteractionCandidates(clean),
    ...detectActivityBursts(clean),
  ].sort((a, b) => a.centerTimeMs - b.centerTimeMs)
  if (candidates.length === 0) return []

  const clusters: Cluster[] = []
  for (const c of candidates) {
    const cStart = c.spanStartMs ?? c.centerTimeMs
    const cEnd = c.spanEndMs ?? c.centerTimeMs
    const last = clusters[clusters.length - 1]
    const closeInTime = last ? cStart - last.lastMs <= mergeGapMs : false
    const closeInSpace = last
      ? Math.hypot(c.focus.cx - last.focus.cx, c.focus.cy - last.focus.cy) <= mergeDistance
      : false

    if (last && closeInTime && closeInSpace) {
      last.firstMs = Math.min(last.firstMs, cStart)
      last.lastMs = Math.max(last.lastMs, cEnd)
      last.totalStrength += c.strength
      last.weightedX += c.focus.cx * c.strength
      last.weightedY += c.focus.cy * c.strength
      last.focus = {
        cx: last.weightedX / last.totalStrength,
        cy: last.weightedY / last.totalStrength,
      }
    } else {
      clusters.push({
        firstMs: cStart,
        lastMs: cEnd,
        totalStrength: c.strength,
        weightedX: c.focus.cx * c.strength,
        weightedY: c.focus.cy * c.strength,
        focus: { cx: c.focus.cx, cy: c.focus.cy },
      })
    }
  }

  // Cap: quedarse con las regiones más fuertes.
  const kept =
    clusters.length > maxRegions
      ? [...clusters].sort((a, b) => b.totalStrength - a.totalStrength).slice(0, maxRegions)
      : clusters

  const regions = kept
    .map<ZoomRegion>((cluster) => {
      const startMs = clamp(cluster.firstMs - padMs, 0, Math.max(0, totalMs))
      let endMs = clamp(cluster.lastMs + padMs, 0, Math.max(0, totalMs))
      if (endMs - startMs < minDurationMs) {
        endMs = clamp(startMs + minDurationMs, 0, Math.max(0, totalMs))
      }
      return {
        id: '',
        startMs,
        endMs,
        depth,
        focus: { cx: clamp01(cluster.focus.cx), cy: clamp01(cluster.focus.cy) },
        mode: 'auto',
      }
    })
    .sort((a, b) => a.startMs - b.startMs)

  return regions.map((r, index) => ({ ...r, id: `zoom-auto-${index + 1}` }))
}
