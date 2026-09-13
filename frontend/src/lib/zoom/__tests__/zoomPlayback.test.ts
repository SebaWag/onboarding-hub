import { describe, expect, it } from 'vitest'
import { computeRegionStrength, computeZoomFrame, zoomFrameToCss } from '../zoomPlayback'
import { ZOOM_DEPTH_SCALES, type ZoomRegion } from '../types'

function region(over: Partial<ZoomRegion> = {}): ZoomRegion {
  return {
    id: 'r1',
    startMs: 10_000,
    endMs: 12_000,
    depth: 2,
    focus: { cx: 0.5, cy: 0.5 },
    mode: 'auto',
    ...over,
  }
}

describe('computeRegionStrength', () => {
  it('es 0 antes de la rampa y después del ramp-out', () => {
    const r = region()
    expect(computeRegionStrength(r, 0)).toBe(0)
    expect(computeRegionStrength(r, 60_000)).toBe(0)
  })

  it('es 1 en la meseta (dentro de la región)', () => {
    const r = region()
    expect(computeRegionStrength(r, 11_000)).toBe(1)
  })

  it('rampa de entrada entre 0 y 1', () => {
    const r = region()
    // leadInStart ≈ 10000 + 500 - 1522.6 = 8977.4
    const s = computeRegionStrength(r, 9500)
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })

  it('rampa de salida entre 1 y 0', () => {
    const r = region()
    // justo después de endMs (12000) arranca el ramp-out
    const s = computeRegionStrength(r, 12_500)
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })
})

describe('computeZoomFrame', () => {
  it('devuelve null si no hay región activa', () => {
    expect(computeZoomFrame([region()], 0)).toBeNull()
  })

  it('devuelve la escala según la profundidad', () => {
    const f = computeZoomFrame([region({ depth: 4 })], 11_000)
    expect(f?.zoomScale).toBe(ZOOM_DEPTH_SCALES[4])
    expect(f?.strength).toBe(1)
  })

  it('elige la región más fuerte cuando hay solapamiento', () => {
    const a = region({ id: 'a', startMs: 10_000, endMs: 12_000 })
    const b = region({ id: 'b', startMs: 11_000, endMs: 13_000, depth: 5 })
    // en 11_500: a está en meseta (1), b recién arranca (<1)
    const f = computeZoomFrame([a, b], 11_500)
    // 'a' tiene fuerza 1 y 'b' menor → gana a (depth 2)
    expect(f?.zoomScale).toBe(ZOOM_DEPTH_SCALES[2])
  })

  it('clampea el foco a [0,1]', () => {
    const r = region({ focus: { cx: 1.5, cy: -0.5 } })
    const f = computeZoomFrame([r], 11_000)
    expect(f?.focusX).toBe(1)
    expect(f?.focusY).toBe(0)
  })
})

describe('zoomFrameToCss', () => {
  it('sin frame devuelve transform none', () => {
    expect(zoomFrameToCss(null)).toEqual({ transform: 'none', transformOrigin: '0 0', active: false })
  })

  it('con foco centrado el translate es 0 y aplica la escala', () => {
    const css = zoomFrameToCss({ zoomScale: 2, focusX: 0.5, focusY: 0.5, strength: 1 })
    // tx% = (50 - 100*0.5*2) = -50 ; ty% = -50 ; scale 2
    expect(css.transform).toBe('translate(-50.000%, -50.000%) scale(2.0000)')
    expect(css.active).toBe(true)
  })

  it('interpola con la fuerza (strength 0 → sin zoom)', () => {
    const css = zoomFrameToCss({ zoomScale: 3, focusX: 0.5, focusY: 0.5, strength: 0 })
    expect(css.active).toBe(false)
    expect(css.transform).toBe('none')
  })

  it('con foco a la izquierda el translate empuja hacia la derecha', () => {
    const css = zoomFrameToCss({ zoomScale: 2, focusX: 0.1, focusY: 0.5, strength: 1 })
    // tx% = (50 - 100*0.1*2) = 30 → positivo
    expect(css.transform.startsWith('translate(30.000%')).toBe(true)
  })
})
