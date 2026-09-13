import { describe, expect, it } from 'vitest'
import {
  clampFocusToScale,
  getFocusBoundsForScale,
  softenFocusToScale,
  stageFocusToVideoSpace,
} from '../focusUtils'

describe('focusUtils', () => {
  it('getFocusBoundsForScale acota el foco según la escala', () => {
    // scale 2 → margen 1/(2*2) = 0.25 en ambos ejes (viewport 1:1)
    expect(getFocusBoundsForScale(2)).toEqual({ minX: 0.25, maxX: 0.75, minY: 0.25, maxY: 0.75 })
    // scale 1 → sin margen (se ve todo)
    expect(getFocusBoundsForScale(1)).toEqual({ minX: 0.5, maxX: 0.5, minY: 0.5, maxY: 0.5 })
  })

  it('clampFocusToScale empuja los focos fuera de rango hacia el borde visible', () => {
    expect(clampFocusToScale({ cx: 0, cy: 0 }, 2)).toEqual({ cx: 0.25, cy: 0.25 })
    expect(clampFocusToScale({ cx: 1, cy: 1 }, 2)).toEqual({ cx: 0.75, cy: 0.75 })
    expect(clampFocusToScale({ cx: 0.5, cy: 0.5 }, 2)).toEqual({ cx: 0.5, cy: 0.5 })
  })

  it('clampFocusToScale respeta un viewport no cuadrado', () => {
    // widthRatio 1.6, scale 2 → margenX = 1.6/4 = 0.4
    const out = clampFocusToScale({ cx: 0, cy: 0.5 }, 2, { widthRatio: 1.6, heightRatio: 1 })
    expect(out.cx).toBeCloseTo(0.4, 5)
    expect(out.cy).toBeCloseTo(0.5, 5)
  })

  it('softenFocusToScale desacelera en los bordes sin salirse de los límites', () => {
    const atMin = softenFocusToScale({ cx: 0, cy: 0.5 }, 2)
    expect(atMin.cx).toBeCloseTo(0.25, 5)

    const mid = softenFocusToScale({ cx: 0.5, cy: 0.5 }, 2)
    expect(mid.cx).toBeCloseTo(0.5, 5)

    // Un valor apenas dentro del borde debe quedar dentro de los bounds.
    const near = softenFocusToScale({ cx: 0.26, cy: 0.5 }, 2)
    expect(near.cx).toBeGreaterThanOrEqual(0.25)
    expect(near.cx).toBeLessThanOrEqual(0.75)
  })

  it('stageFocusToVideoSpace es identidad cuando stage == video y sin offset', () => {
    const out = stageFocusToVideoSpace(
      { cx: 0.3, cy: 0.7 },
      { width: 1000, height: 1000 },
      { width: 1000, height: 1000 },
      1,
      { x: 0, y: 0 },
    )
    expect(out.cx).toBeCloseTo(0.3, 5)
    expect(out.cy).toBeCloseTo(0.7, 5)
  })

  it('stageFocusToVideoSpace devuelve el foco intacto con entradas inválidas', () => {
    const focus = { cx: 0.2, cy: 0.2 }
    expect(
      stageFocusToVideoSpace(focus, { width: 0, height: 0 }, { width: 0, height: 0 }, 1, {
        x: 0,
        y: 0,
      }),
    ).toEqual(focus)
  })
})
