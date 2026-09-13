// Geometría pura del transform de zoom. Depende SOLO de aritmética.
// Portado desde getopenscreen/openscreen (MIT) — src/lib/zoomMath/zoomTransform.ts

import { clamp01 } from './mathUtils'

export interface AppliedZoomTransform {
  scale: number
  x: number
  y: number
}

export interface ZoomTransformGeometry {
  stageSize: { width: number; height: number }
  baseMask: { x: number; y: number; width: number; height: number }
  zoomScale: number
  zoomProgress?: number
  focusX: number
  focusY: number
}

/**
 * Calcula el transform (scale + translate) de la cámara de zoom.
 *
 * El foco está normalizado (0..1) respecto al canvas del stage, así que se mapea
 * directo a píxeles del stage (no vía baseMask).
 */
export function computeZoomTransform({
  stageSize,
  baseMask,
  zoomScale,
  zoomProgress = 1,
  focusX,
  focusY,
}: ZoomTransformGeometry): AppliedZoomTransform {
  if (
    stageSize.width <= 0 ||
    stageSize.height <= 0 ||
    baseMask.width <= 0 ||
    baseMask.height <= 0
  ) {
    return { scale: 1, x: 0, y: 0 }
  }

  const progress = clamp01(zoomProgress)
  const focusStagePxX = focusX * stageSize.width
  const focusStagePxY = focusY * stageSize.height
  const stageCenterX = stageSize.width / 2
  const stageCenterY = stageSize.height / 2
  const scale = 1 + (zoomScale - 1) * progress
  const finalX = stageCenterX - focusStagePxX * zoomScale
  const finalY = stageCenterY - focusStagePxY * zoomScale

  // Normalizamos -0 -> 0: finalX * 0 puede dar -0 en JS y sorprende a los consumidores.
  const x = finalX * progress
  const y = finalY * progress

  return {
    scale,
    x: x === 0 ? 0 : x,
    y: y === 0 ? 0 : y,
  }
}

/**
 * Reconvierte un transform de cámara a la ventana de origen (sx, sy, sw, sh) para
 * `ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvasW, canvasH)`.
 *
 * `scale` = cuánto ampliar (1 = sin zoom). `x`/`y` = desplazamiento en píxeles
 * del stage (negativo = mueve el contenido a la izquierda/arriba).
 */
export function toSourceRect(
  transform: AppliedZoomTransform,
  sourceWidth: number,
  sourceHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = transform.scale > 0 ? transform.scale : 1
  const sw = sourceWidth / scale
  const sh = sourceHeight / scale
  const sx = (sourceWidth - sw) / 2 - transform.x / scale
  const sy = (sourceHeight - sh) / 2 - transform.y / scale

  return {
    sx: Math.max(0, Math.min(sourceWidth - sw, sx)),
    sy: Math.max(0, Math.min(sourceHeight - sh, sy)),
    sw,
    sh,
  }
}
