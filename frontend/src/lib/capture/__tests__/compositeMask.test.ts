import { describe, expect, it } from 'vitest'
import { compositePersonOverBackground } from '../compositeMask'

describe('compositePersonOverBackground', () => {
  it('reemplaza con el video donde la máscara supera el umbral', () => {
    // Lienzo 2x1: fondo azul, persona roja
    const out = new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 255, 255])
    const person = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255])
    const mask = new Float32Array([0.9, 0.1]) // px0 persona, px1 fondo

    const n = compositePersonOverBackground(out, person, mask, 2, 1, 2, 1, 0.5)

    expect(n).toBe(1)
    expect([out[0], out[1], out[2]]).toEqual([255, 0, 0]) // px0 → persona
    expect([out[4], out[5], out[6]]).toEqual([0, 0, 255]) // px1 → fondo intacto
  })

  it('escala la máscara de menor resolución al lienzo (vecino más cercano)', () => {
    // Lienzo 4x4, máscara 2x2 con la esquina superior-izquierda = persona
    const out = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < out.length; i += 4) { out[i] = 10; out[i + 1] = 10; out[i + 2] = 10; out[i + 3] = 255 }
    const person = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < person.length; i += 4) { person[i] = 200; person[i + 1] = 0; person[i + 2] = 0; person[i + 3] = 255 }
    // 2x2: [persona, fondo; fondo, fondo]
    const mask = new Float32Array([1, 0, 0, 0])

    const n = compositePersonOverBackground(out, person, mask, 4, 4, 2, 2, 0.5)

    // 2x2 píxeles del top-left → 4 píxeles en el lienzo 4x4
    expect(n).toBe(4)
    expect(out[0]).toBe(200) // (0,0) persona
    expect(out[(1 * 4 + 0) * 4]).toBe(200) // (1,0) persona
    expect(out[(0 * 4 + 2) * 4]).toBe(10) // (2,0) fondo
    expect(out[(3 * 4 + 3) * 4]).toBe(10) // (3,3) fondo
  })

  it('no modifica nada si la máscara es todo fondo', () => {
    const out = new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 255, 255])
    const person = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255])
    const mask = new Float32Array([0, 0])
    const n = compositePersonOverBackground(out, person, mask, 2, 1, 2, 1, 0.5)
    expect(n).toBe(0)
    expect([out[0], out[1], out[2]]).toEqual([0, 0, 255])
  })

  it('tolera dimensiones inválidas sin lanzar', () => {
    const n = compositePersonOverBackground(new Uint8ClampedArray(0), new Uint8ClampedArray(0), new Float32Array(0), 0, 0, 0, 0)
    expect(n).toBe(0)
  })
})
