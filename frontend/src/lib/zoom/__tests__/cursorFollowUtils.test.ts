import { describe, expect, it } from 'vitest'
import {
  adaptiveSmoothFactor,
  advanceFollowFocus,
  interpolateCursorAt,
  smoothCursorFocus,
  timeCorrectedFollowFactor,
} from '../cursorFollowUtils'
import type { CursorTelemetryPoint } from '../types'

const TELEMETRY: CursorTelemetryPoint[] = [
  { timeMs: 0, cx: 0, cy: 0 },
  { timeMs: 1000, cx: 1, cy: 0.5 },
  { timeMs: 2000, cx: 0, cy: 1 },
]

describe('interpolateCursorAt', () => {
  it('devuelve null sin telemetría', () => {
    expect(interpolateCursorAt([], 500)).toBeNull()
  })

  it('hace clamp a los extremos antes del primero y después del último', () => {
    expect(interpolateCursorAt(TELEMETRY, -100)).toEqual({ cx: 0, cy: 0 })
    expect(interpolateCursorAt(TELEMETRY, 99999)).toEqual({ cx: 0, cy: 1 })
  })

  it('interpola linealmente entre dos muestras', () => {
    const mid = interpolateCursorAt(TELEMETRY, 500)
    expect(mid?.cx).toBeCloseTo(0.5, 5)
    expect(mid?.cy).toBeCloseTo(0.25, 5)
  })
})

describe('smoothCursorFocus', () => {
  it('se mueve una fracción hacia el target', () => {
    const out = smoothCursorFocus({ cx: 1, cy: 1 }, { cx: 0, cy: 0 }, 0.5)
    expect(out).toEqual({ cx: 0.5, cy: 0.5 })
  })
})

describe('adaptiveSmoothFactor', () => {
  it('usa minFactor cuando está quieto y maxFactor cuando está lejos', () => {
    const near = adaptiveSmoothFactor({ cx: 0, cy: 0 }, { cx: 0, cy: 0 }, 0.1, 0.25, 0.15)
    expect(near).toBeCloseTo(0.1, 5)

    const far = adaptiveSmoothFactor({ cx: 1, cy: 1 }, { cx: 0, cy: 0 }, 0.1, 0.25, 0.15)
    expect(far).toBeCloseTo(0.25, 5)
  })
})

describe('timeCorrectedFollowFactor', () => {
  it('devuelve 0 para dt no positivo', () => {
    expect(timeCorrectedFollowFactor(0.1, 0, 25)).toBe(0)
    expect(timeCorrectedFollowFactor(0.1, -5, 25)).toBe(0)
  })

  it('converge igual sin importar el troceado del render', () => {
    // dt == reference → factor base
    expect(timeCorrectedFollowFactor(0.1, 25, 25)).toBeCloseTo(0.1, 6)
    // dos trozos de reference equivalen a un dt doble
    const oneBig = timeCorrectedFollowFactor(0.1, 50, 25)
    const twoSmall = 1 - (1 - timeCorrectedFollowFactor(0.1, 25, 25)) ** 2
    expect(oneBig).toBeCloseTo(twoSmall, 5)
  })
})

describe('advanceFollowFocus', () => {
  it('no se mueve en pausa (dt <= 0)', () => {
    const prev = { cx: 0.2, cy: 0.2 }
    const out = advanceFollowFocus(prev, { cx: 0.9, cy: 0.9 }, 0, {
      minFactor: 0.1,
      maxFactor: 0.25,
      rampDistance: 0.15,
      referenceMs: 25,
    })
    expect(out).toBe(prev)
  })

  it('se acerca al target sin pasarse', () => {
    const out = advanceFollowFocus({ cx: 0, cy: 0 }, { cx: 1, cy: 1 }, 25, {
      minFactor: 0.1,
      maxFactor: 0.25,
      rampDistance: 0.15,
      referenceMs: 25,
    })
    expect(out.cx).toBeGreaterThan(0)
    expect(out.cx).toBeLessThan(1)
    expect(out.cy).toBe(out.cx)
  })
})
