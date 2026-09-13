import { describe, expect, it } from 'vitest'
import { LiveZoomController } from '../liveZoomController'
import { ZOOM_DEPTH_SCALES } from '../types'

const DEPTH = 2 // 1.5x
const SCALE = ZOOM_DEPTH_SCALES[DEPTH]

function makeController() {
  return new LiveZoomController({
    depth: DEPTH,
    stageSize: { width: 1000, height: 1000 },
    holdMs: 1000,
    minDwellMs: 450,
  })
}

describe('LiveZoomController', () => {
  it('arranca en vista completa (scale 1)', () => {
    const c = makeController()
    const t = c.frame(0, { cx: 0.5, cy: 0.5 })
    expect(t.scale).toBeCloseTo(1, 5)
  })

  it('un click dispara zoom-in hacia la profundidad configurada', () => {
    const c = makeController()
    c.ingest({ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: 'click' })
    let scale = 1
    for (let t = 16; t <= 500; t += 16) {
      scale = c.frame(t, { cx: 0.5, cy: 0.5 }).scale
    }
    expect(scale).toBeGreaterThan(1.2)
    expect(scale).toBeLessThanOrEqual(SCALE + 1e-6)
  })

  it('tras el hold, se retira suavemente a la vista completa', () => {
    const c = makeController()
    c.ingest({ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: 'click' })
    let scale = 1
    for (let t = 16; t <= 3000; t += 16) {
      scale = c.frame(t, { cx: 0.5, cy: 0.5 }).scale
    }
    expect(scale).toBeLessThan(1.05)
  })

  it('el cursor quieto (dwell) dispara zoom sin clicks', () => {
    const c = makeController()
    c.ingest({ timeMs: 0, cx: 0.8, cy: 0.2, interactionType: 'move' })
    c.ingest({ timeMs: 100, cx: 0.8, cy: 0.2, interactionType: 'move' })
    let scale = 1
    for (let t = 100; t <= 900; t += 16) {
      scale = c.frame(t, { cx: 0.8, cy: 0.2 }).scale
    }
    expect(scale).toBeGreaterThan(1.05)
  })

  it('el cursor fuera (null) retira el zoom', () => {
    const c = makeController()
    c.ingest({ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: 'click' })
    for (let t = 16; t <= 300; t += 16) c.frame(t, { cx: 0.5, cy: 0.5 })
    let scale = SCALE
    for (let t = 316; t <= 2000; t += 16) {
      scale = c.frame(t, null).scale
    }
    expect(scale).toBeLessThan(1.05)
  })

  it('el foco se centra en el punto del click (translate acotado)', () => {
    const c = makeController()
    c.ingest({ timeMs: 0, cx: 1, cy: 1, interactionType: 'click' })
    let out = { scale: 1, x: 0, y: 0 }
    for (let t = 16; t <= 800; t += 16) {
      out = c.frame(t, { cx: 1, cy: 1 })
    }
    // Con zoom y foco en la esquina, el transform debe desplazar la imagen.
    expect(Math.abs(out.x)).toBeGreaterThan(0)
    expect(Math.abs(out.y)).toBeGreaterThan(0)
  })

  it('reset vuelve a la vista completa', () => {
    const c = makeController()
    c.ingest({ timeMs: 0, cx: 0.5, cy: 0.5, interactionType: 'click' })
    for (let t = 16; t <= 300; t += 16) c.frame(t, { cx: 0.5, cy: 0.5 })
    c.reset()
    expect(c.frame(400, { cx: 0.5, cy: 0.5 }).scale).toBeCloseTo(1, 5)
  })
})
