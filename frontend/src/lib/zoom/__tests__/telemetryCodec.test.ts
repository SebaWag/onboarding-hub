import { describe, expect, it } from 'vitest'
import { compressTelemetry } from '../telemetryCodec'
import type { CursorTelemetryPoint } from '../types'

function move(t: number): CursorTelemetryPoint {
  return { timeMs: t, cx: 0.5, cy: 0.5, interactionType: 'move' }
}
function click(t: number): CursorTelemetryPoint {
  return { timeMs: t, cx: 0.5, cy: 0.5, interactionType: 'click' }
}

describe('compressTelemetry', () => {
  it('devuelve todo tal cual si está bajo el presupuesto', () => {
    const samples = [move(0), move(16), click(32)]
    expect(compressTelemetry(samples, 10)).toHaveLength(3)
  })

  it('conserva TODAS las interacciones al comprimir', () => {
    const samples: CursorTelemetryPoint[] = []
    for (let i = 0; i < 1000; i++) samples.push(move(i * 16))
    samples.push(click(100))
    samples.push(click(5000))
    samples.push(click(9000))

    const out = compressTelemetry(samples, 100)
    expect(out).toHaveLength(100)
    expect(out.filter((s) => s.interactionType === 'click')).toHaveLength(3)
  })

  it('respeta el presupuesto máximo', () => {
    const samples: CursorTelemetryPoint[] = []
    for (let i = 0; i < 5000; i++) samples.push(move(i * 16))
    expect(compressTelemetry(samples, 250)).toHaveLength(250)
  })

  it('devuelve ordenado por tiempo', () => {
    const samples: CursorTelemetryPoint[] = []
    for (let i = 0; i < 1000; i++) samples.push(move(i * 16))
    samples.push(click(10))
    const out = compressTelemetry(samples, 50)
    for (let i = 1; i < out.length; i++) {
      expect(out[i].timeMs).toBeGreaterThanOrEqual(out[i - 1].timeMs)
    }
  })

  it('descarta campos no necesarios (cursorType/pressure)', () => {
    const samples: CursorTelemetryPoint[] = [
      { timeMs: 0, cx: 0.1, cy: 0.2, interactionType: 'move', cursorType: 'pointer', pressure: 0.5 },
    ]
    const out = compressTelemetry(samples, 10)
    expect(out[0].cursorType).toBeUndefined()
    expect(out[0].pressure).toBeUndefined()
  })

  it('si hay más interacciones que el presupuesto, devuelve las interacciones', () => {
    const samples = [click(0), click(10), click(20)]
    const out = compressTelemetry(samples, 2)
    expect(out).toHaveLength(3)
    expect(out.every((s) => s.interactionType === 'click')).toBe(true)
  })
})
