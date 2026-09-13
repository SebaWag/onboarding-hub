import { describe, expect, it } from 'vitest'
import {
  detectActivityBursts,
  detectDwellCandidates,
  detectInteractionCandidates,
  sanitizeTelemetry,
  suggestZoomRegions,
} from '../zoomSuggestion'
import type { CursorInteractionType, CursorTelemetryPoint } from '../types'

function mk(timeMs: number, cx: number, cy: number, interactionType?: CursorInteractionType): CursorTelemetryPoint {
  return { timeMs, cx, cy, interactionType }
}

/** Genera N muestras quietas en el mismo punto, separadas `step` ms. */
function dwell(cx: number, cy: number, durationMs: number, step = 100): CursorTelemetryPoint[] {
  const out: CursorTelemetryPoint[] = []
  for (let t = 0; t <= durationMs; t += step) out.push(mk(t, cx, cy, 'move'))
  return out
}

describe('sanitizeTelemetry', () => {
  it('filtra NaN, clampa a [0,1] y ordena por tiempo', () => {
    const out = sanitizeTelemetry(
      [
        mk(300, 1.5, -0.2),
        mk(100, 0.5, 0.5),
        { timeMs: NaN, cx: 0.5, cy: 0.5 },
        mk(200, 0.1, 0.9),
      ],
      1000,
    )
    expect(out.map((s) => s.timeMs)).toEqual([100, 200, 300])
    expect(out[2].cx).toBe(1)
    expect(out[2].cy).toBe(0)
  })

  it('clampa el tiempo a totalMs', () => {
    const out = sanitizeTelemetry([mk(5000, 0.5, 0.5)], 1000)
    expect(out[0].timeMs).toBe(1000)
  })
})

describe('detectDwellCandidates', () => {
  it('detecta una quedada válida con su centroide y duración', () => {
    const c = detectDwellCandidates(dwell(0.4, 0.6, 800))
    expect(c).toHaveLength(1)
    expect(c[0].strength).toBeCloseTo(800, 0)
    expect(c[0].focus.cx).toBeCloseTo(0.4, 5)
    expect(c[0].focus.cy).toBeCloseTo(0.6, 5)
  })

  it('ignora quedadas demasiado cortas (< 450ms)', () => {
    expect(detectDwellCandidates(dwell(0.5, 0.5, 200))).toHaveLength(0)
  })

  it('ignora quedadas demasiado largas (> 2600ms)', () => {
    expect(detectDwellCandidates(dwell(0.5, 0.5, 3000))).toHaveLength(0)
  })

  it('separa dos quedadas si hubo movimiento entre medio', () => {
    const samples = [...dwell(0.2, 0.2, 800), ...dwell(0.8, 0.8, 800, 100).map((s) => ({ ...s, timeMs: s.timeMs + 900 }))]
    const c = detectDwellCandidates(samples)
    expect(c).toHaveLength(2)
  })
})

describe('detectInteractionCandidates', () => {
  it('marca un click explícito con fuerza 900', () => {
    const c = detectInteractionCandidates([mk(100, 0.3, 0.3, 'click')])
    expect(c).toHaveLength(1)
    expect(c[0].kind).toBe('click')
    expect(c[0].strength).toBe(900)
    expect(c[0].source).toBe('explicit')
  })

  it('marca doble-click explícito con fuerza 1500', () => {
    const c = detectInteractionCandidates([mk(100, 0.3, 0.3, 'double-click')])
    expect(c[0].kind).toBe('double-click')
    expect(c[0].strength).toBe(1500)
  })
})

describe('suggestZoomRegions', () => {
  it('sin telemetría devuelve []', () => {
    expect(suggestZoomRegions([], 10000)).toEqual([])
  })

  it('fusiona dos clicks cercanos en una sola región', () => {
    const regions = suggestZoomRegions([mk(1000, 0.5, 0.5, 'click'), mk(1500, 0.52, 0.5, 'click')], 10000)
    expect(regions).toHaveLength(1)
    expect(regions[0].startMs).toBe(500)
    expect(regions[0].endMs).toBe(2000)
    expect(regions[0].mode).toBe('auto')
  })

  it('separa clicks lejanos en el espacio', () => {
    const regions = suggestZoomRegions([mk(1000, 0.1, 0.1, 'click'), mk(1500, 0.9, 0.9, 'click')], 10000)
    expect(regions).toHaveLength(2)
  })

  it('separa clicks lejanos en el tiempo', () => {
    const regions = suggestZoomRegions([mk(1000, 0.5, 0.5, 'click'), mk(9000, 0.5, 0.5, 'click')], 10000)
    expect(regions).toHaveLength(2)
  })

  it('aplica padding, respeta la duración mínima y clampa a [0, totalMs]', () => {
    const regions = suggestZoomRegions([mk(100, 0.5, 0.5, 'click')], 5000, { padMs: 500, minDurationMs: 700 })
    expect(regions[0].startMs).toBe(0) // 100 - 500 → clamp a 0
    expect(regions[0].endMs).toBe(700) // 600 < 700 → se extiende a 700
    expect(regions[0].endMs).toBeLessThanOrEqual(5000)
  })

  it('no excede totalMs por la derecha', () => {
    const regions = suggestZoomRegions([mk(4900, 0.5, 0.5, 'click')], 5000, { padMs: 500 })
    expect(regions[0].endMs).toBeLessThanOrEqual(5000)
  })

  it('aplica el cap de maxRegions y entrega ids ordenados por tiempo', () => {
    const clicks = [
      mk(1000, 0.5, 0.5, 'click'),
      mk(4000, 0.5, 0.5, 'click'),
      mk(7000, 0.5, 0.5, 'click'),
      mk(10000, 0.5, 0.5, 'click'),
      mk(13000, 0.5, 0.5, 'click'),
    ]
    const regions = suggestZoomRegions(clicks, 20000, { maxRegions: 3 })
    expect(regions).toHaveLength(3)
    expect(regions.map((r) => r.id)).toEqual(['zoom-auto-1', 'zoom-auto-2', 'zoom-auto-3'])
    // ordenadas por tiempo
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i].startMs).toBeGreaterThanOrEqual(regions[i - 1].startMs)
    }
  })

  it('usa el depth indicado', () => {
    const regions = suggestZoomRegions([mk(1000, 0.5, 0.5, 'click')], 5000, { depth: 4 })
    expect(regions[0].depth).toBe(4)
  })
})

describe('detectActivityBursts', () => {
  it('detecta una ráfaga de movimiento continuo y cubre su span', () => {
    const samples: CursorTelemetryPoint[] = []
    for (let i = 0; i < 20; i++) samples.push(mk(i * 40, 0.1 + i * 0.03, 0.2 + i * 0.02, 'move'))
    const bursts = detectActivityBursts(samples)
    expect(bursts).toHaveLength(1)
    expect(bursts[0].kind).toBe('activity')
    expect(bursts[0].spanStartMs).toBe(0)
    expect(bursts[0].spanEndMs).toBe(19 * 40)
  })

  it('ignora un "teletransporte" de 2 muestras (sin movimiento continuo)', () => {
    const samples: CursorTelemetryPoint[] = [mk(0, 0.1, 0.1, 'move'), mk(500, 0.9, 0.9, 'move')]
    expect(detectActivityBursts(samples)).toHaveLength(0)
  })

  it('ignora tramos sin movimiento (cursor quieto)', () => {
    const samples: CursorTelemetryPoint[] = []
    for (let i = 0; i < 20; i++) samples.push(mk(i * 40, 0.5, 0.5, 'move'))
    expect(detectActivityBursts(samples)).toHaveLength(0)
  })

  it('separa ráfagas con un gap grande', () => {
    const a: CursorTelemetryPoint[] = []
    for (let i = 0; i < 10; i++) a.push(mk(i * 40, 0.1 + i * 0.02, 0.1, 'move'))
    const b: CursorTelemetryPoint[] = []
    for (let i = 0; i < 10; i++) b.push(mk(5000 + i * 40, 0.5 + i * 0.02, 0.5, 'move'))
    expect(detectActivityBursts([...a, ...b])).toHaveLength(2)
  })
})

describe('suggestZoomRegions con actividad', () => {
  it('genera una región por ráfaga de actividad (no solo por clicks)', () => {
    const samples: CursorTelemetryPoint[] = []
    for (let i = 0; i < 25; i++) samples.push(mk(i * 40, 0.15 + i * 0.03, 0.3, 'move'))
    const regions = suggestZoomRegions(samples, 3000)
    expect(regions.length).toBeGreaterThanOrEqual(1)
  })
})
