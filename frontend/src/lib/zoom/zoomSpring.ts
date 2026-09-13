// Spring-chase del transform de la cámara de zoom.
//
// `computeZoomTransform` da un target regido por easing. Aplicarlo directo
// reproduce cada discontinuidad de velocidad (arranque del ease-in, costuras
// entre regiones cercanas) → se lee como sacudida (jerk). En su lugar perseguimos
// el target con un spring por eje: el target mantiene el timing autoral, el spring
// mantiene continuidad de velocidad.
//
// Portado desde getopenscreen/openscreen (MIT) — src/lib/zoomMath/zoomSpring.ts

import {
  createSpringState,
  getZoomSpringConfig,
  stepSpringValue,
  type SpringState,
} from './motionSmoothing'

export interface ZoomTransform {
  scale: number
  x: number
  y: number
}

export interface ZoomSpringState {
  scale: SpringState
  x: SpringState
  y: SpringState
}

export function createZoomSpringState(): ZoomSpringState {
  return {
    scale: createSpringState(1),
    x: createSpringState(0),
    y: createSpringState(0),
  }
}

/** Salta cada eje directo al target (se usa en seek / pausa / primer frame). */
export function resetZoomSpring(state: ZoomSpringState, target: ZoomTransform): void {
  const axes: Array<[SpringState, number]> = [
    [state.scale, target.scale],
    [state.x, target.x],
    [state.y, target.y],
  ]

  for (const [axis, value] of axes) {
    axis.value = value
    axis.velocity = 0
    axis.initialized = true
  }
}

/**
 * Avanza un eje hacia el target con clamp de overshoot para target móvil. El
 * target se mueve cada frame, así que un spring rápido puede pasarse de largo en
 * una reversión y oscilar. Si el step cruza el target, hace snap y velocity=0.
 */
function stepAxis(
  axis: SpringState,
  target: number,
  deltaMs: number,
  config: ReturnType<typeof getZoomSpringConfig>,
): number {
  const before = axis.initialized ? axis.value : target
  const after = stepSpringValue(axis, target, deltaMs, config)
  const crossed = (before <= target && after > target) || (before >= target && after < target)

  if (crossed) {
    axis.value = target
    axis.velocity = 0
    return target
  }

  return after
}

/** Avanza el spring hacia el target durante `deltaMs`; devuelve el transform suavizado. */
export function stepZoomSpring(
  state: ZoomSpringState,
  target: ZoomTransform,
  deltaMs: number,
): ZoomTransform {
  const config = getZoomSpringConfig()
  return {
    scale: stepAxis(state.scale, target.scale, deltaMs, config),
    x: stepAxis(state.x, target.x, deltaMs, config),
    y: stepAxis(state.y, target.y, deltaMs, config),
  }
}
