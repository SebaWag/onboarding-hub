import { describe, expect, it } from 'vitest'
import { createZoomSpringState, resetZoomSpring, stepZoomSpring } from '../zoomSpring'

const DT = 1000 / 60

describe('zoom spring chase', () => {
  it('resetZoomSpring snaps every axis exactly to the target', () => {
    const state = createZoomSpringState()
    resetZoomSpring(state, { scale: 1.8, x: -120, y: 40 })
    expect(stepZoomSpring(state, { scale: 1.8, x: -120, y: 40 }, DT)).toEqual({
      scale: 1.8,
      x: -120,
      y: 40,
    })
  })

  it('eases into a jumped target instead of snapping (velocity continuity)', () => {
    const state = createZoomSpringState()
    resetZoomSpring(state, { scale: 1, x: 0, y: 0 })
    // El target salta de 1 a 2; un solo step NO debe teletransportarse.
    const first = stepZoomSpring(state, { scale: 2, x: 0, y: 0 }, DT)
    expect(first.scale).toBeGreaterThan(1)
    expect(first.scale).toBeLessThan(2)
  })

  it('converges to a static target without overshooting it', () => {
    const state = createZoomSpringState()
    resetZoomSpring(state, { scale: 1, x: 0, y: 0 })
    const target = { scale: 2.2, x: 0, y: 0 }
    let maxScale = 1
    let last = 1
    for (let i = 0; i < 200; i++) {
      last = stepZoomSpring(state, target, DT).scale
      maxScale = Math.max(maxScale, last)
    }
    expect(last).toBeCloseTo(2.2, 2) // se asentó en el target
    expect(maxScale).toBeLessThanOrEqual(2.2 + 1e-6) // nunca se pasó
  })

  it('does not overshoot when the target reverses mid-motion', () => {
    const state = createZoomSpringState()
    resetZoomSpring(state, { scale: 1, x: 0, y: 0 })
    // Acumula momento hacia arriba persiguiendo un target alto...
    for (let i = 0; i < 8; i++) stepZoomSpring(state, { scale: 3, x: 0, y: 0 }, DT)
    // ...y revierte el target por debajo del valor actual; el momento no debe pasarse.
    const reverseTarget = { scale: 1.5, x: 0, y: 0 }
    let min = Number.POSITIVE_INFINITY
    for (let i = 0; i < 200; i++) {
      min = Math.min(min, stepZoomSpring(state, reverseTarget, DT).scale)
    }
    expect(min).toBeGreaterThanOrEqual(1.5 - 1e-6)
  })

  it('steps each axis independently', () => {
    const state = createZoomSpringState()
    resetZoomSpring(state, { scale: 1, x: 0, y: 0 })
    const out = stepZoomSpring(state, { scale: 1, x: 100, y: 0 }, DT)
    expect(out.scale).toBe(1)
    expect(out.x).toBeGreaterThan(0)
    expect(out.x).toBeLessThan(100)
    expect(out.y).toBe(0)
  })
})
