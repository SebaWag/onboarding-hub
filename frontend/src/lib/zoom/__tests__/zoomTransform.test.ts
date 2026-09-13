import { describe, expect, it } from 'vitest'
import { computeZoomTransform, toSourceRect } from '../zoomTransform'

const STAGE = { width: 1000, height: 1000 }
const MASK = { x: 0, y: 0, width: 1000, height: 1000 }

describe('zoomTransform', () => {
  it('sin zoom y foco centrado → transform neutro', () => {
    const out = computeZoomTransform({
      stageSize: STAGE,
      baseMask: MASK,
      zoomScale: 1,
      zoomProgress: 1,
      focusX: 0.5,
      focusY: 0.5,
    })
    expect(out).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('con zoom y foco centrado → traslada para centrar el foco', () => {
    const out = computeZoomTransform({
      stageSize: STAGE,
      baseMask: MASK,
      zoomScale: 2,
      zoomProgress: 1,
      focusX: 0.5,
      focusY: 0.5,
    })
    expect(out.scale).toBe(2)
    expect(out.x).toBeCloseTo(-500, 5)
    expect(out.y).toBeCloseTo(-500, 5)
  })

  it('progress 0 devuelve el estado neutro (zoom no aplicado)', () => {
    const out = computeZoomTransform({
      stageSize: STAGE,
      baseMask: MASK,
      zoomScale: 2,
      zoomProgress: 0,
      focusX: 0.3,
      focusY: 0.8,
    })
    expect(out).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('devuelve neutro si el stage es inválido', () => {
    const out = computeZoomTransform({
      stageSize: { width: 0, height: 0 },
      baseMask: MASK,
      zoomScale: 2,
      focusX: 0.5,
      focusY: 0.5,
    })
    expect(out).toEqual({ scale: 1, x: 0, y: 0 })
  })
})

describe('toSourceRect', () => {
  it('sin zoom devuelve la imagen completa', () => {
    expect(toSourceRect({ scale: 1, x: 0, y: 0 }, 1920, 1080)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1920,
      sh: 1080,
    })
  })

  it('con zoom 2x centrado reduce la ventana de origen a la mitad', () => {
    const out = toSourceRect({ scale: 2, x: 0, y: 0 }, 1920, 1080)
    expect(out.sw).toBeCloseTo(960, 5)
    expect(out.sh).toBeCloseTo(540, 5)
    expect(out.sx).toBeCloseTo(480, 5)
    expect(out.sy).toBeCloseTo(270, 5)
  })

  it('nunca devuelve una ventana fuera de la imagen', () => {
    const out = toSourceRect({ scale: 2, x: 99999, y: -99999 }, 1920, 1080)
    expect(out.sx).toBeGreaterThanOrEqual(0)
    expect(out.sy).toBeGreaterThanOrEqual(0)
    expect(out.sx + out.sw).toBeLessThanOrEqual(1920 + 1e-6)
    expect(out.sy + out.sh).toBeLessThanOrEqual(1080 + 1e-6)
  })
})
