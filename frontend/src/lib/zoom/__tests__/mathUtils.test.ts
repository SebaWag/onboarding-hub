import { describe, expect, it } from 'vitest'
import { clamp, clamp01, cubicBezier, easeOutCubic, easeOutScreenStudio, lerp } from '../mathUtils'

describe('mathUtils', () => {
  it('clamp / clamp01 respetan los límites', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(0.42)).toBe(0.42)
    expect(clamp01(7)).toBe(1)
  })

  it('lerp interpola linealmente', () => {
    expect(lerp(0, 10, 0.5)).toBe(5)
    expect(lerp(2, 4, 0)).toBe(2)
    expect(lerp(2, 4, 1)).toBe(4)
  })

  it('cubicBezier es monótona y anclada en (0,0)-(1,1)', () => {
    expect(cubicBezier(0.16, 1, 0.3, 1, 0)).toBeCloseTo(0, 5)
    expect(cubicBezier(0.16, 1, 0.3, 1, 1)).toBeCloseTo(1, 5)
    let prev = -1
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const y = cubicBezier(0.16, 1, 0.3, 1, t)
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = y
    }
  })

  it('easeOutScreenStudio arranca rápido (ease-out)', () => {
    // En el primer 20% del tiempo ya avanzó bastante más del 20%.
    expect(easeOutScreenStudio(0.2)).toBeGreaterThan(0.2)
    expect(easeOutScreenStudio(1)).toBeCloseTo(1, 5)
    expect(easeOutScreenStudio(0)).toBeCloseTo(0, 5)
  })

  it('easeOutCubic va de 0 a 1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5)
  })
})
