// Utilidades matemáticas puras para el motor de auto-zoom.
// Portado desde getopenscreen/openscreen (MIT) — src/lib/zoomMath/mathUtils.ts
// Adaptado a onboarding-hub (sin alias, estilo del proyecto).

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function sampleCubicBezier(a1: number, a2: number, t: number): number {
  const oneMinusT = 1 - t
  return 3 * a1 * oneMinusT * oneMinusT * t + 3 * a2 * oneMinusT * t * t + t * t * t
}

function sampleCubicBezierDerivative(a1: number, a2: number, t: number): number {
  const oneMinusT = 1 - t
  return 3 * a1 * oneMinusT * oneMinusT + 6 * (a2 - a1) * oneMinusT * t + 3 * (1 - a2) * t * t
}

/**
 * Curva de Bézier cúbica resuelta por Newton-Raphson (8 iteraciones) + bisección
 * (10 iteraciones). Misma firma que el `cubic-bezier(x1,y1,x2,y2)` de CSS.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  const targetX = clamp01(t)
  let solvedT = targetX

  for (let i = 0; i < 8; i += 1) {
    const currentX = sampleCubicBezier(x1, x2, solvedT) - targetX
    const currentDerivative = sampleCubicBezierDerivative(x1, x2, solvedT)

    if (Math.abs(currentX) < 1e-6 || Math.abs(currentDerivative) < 1e-6) {
      break
    }

    solvedT -= currentX / currentDerivative
  }

  let lower = 0
  let upper = 1
  solvedT = clamp01(solvedT)

  for (let i = 0; i < 10; i += 1) {
    const currentX = sampleCubicBezier(x1, x2, solvedT)
    if (Math.abs(currentX - targetX) < 1e-6) {
      break
    }

    if (currentX < targetX) {
      lower = solvedT
    } else {
      upper = solvedT
    }

    solvedT = (lower + upper) / 2
  }

  return sampleCubicBezier(y1, y2, solvedT)
}

/** Easing firma de Screen Studio para la transición de zoom-in. */
export function easeOutScreenStudio(t: number): number {
  return cubicBezier(0.16, 1, 0.3, 1, t)
}

/** Ease-out cúbico, usado para que el zoom-out baje hasta cero. */
export function easeOutCubic(t: number): number {
  const x = clamp01(t)
  return 1 - Math.pow(1 - x, 3)
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount
}
