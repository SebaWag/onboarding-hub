/**
 * Compone un frame a partir de la máscara de segmentación: donde la máscara
 * marca "persona" se usa el píxel del video; el resto conserva el fondo.
 *
 * La máscara suele venir a MENOR resolución que el lienzo (los modelos de
 * segmentación trabajan a ~256x256), así que se muestrea por vecino más cercano.
 *
 * Función pura (sin DOM) para poder testearla de forma aislada.
 *
 * @param out        Píxeles del lienzo de salida (RGBA). El fondo ya está dibujado.
 * @param person     Píxeles del frame de video (RGBA), a la resolución del lienzo.
 * @param mask       Confianza de persona por píxel (típicamente 0..1), largo maskWidth*maskHeight.
 * @param width      Ancho del lienzo (px).
 * @param height     Alto del lienzo (px).
 * @param maskWidth  Ancho de la máscara (px).
 * @param maskHeight Alto de la máscara (px).
 * @param threshold  Umbral de la máscara a partir del cual es "persona".
 * @returns Cantidad de píxeles marcados como persona (útil para tests/telemetría).
 */
export function compositePersonOverBackground(
  out: Uint8ClampedArray,
  person: Uint8ClampedArray | ArrayLike<number>,
  mask: ArrayLike<number>,
  width: number,
  height: number,
  maskWidth: number,
  maskHeight: number,
  threshold = 0.5,
): number {
  if (width <= 0 || height <= 0 || maskWidth <= 0 || maskHeight <= 0) return 0
  let personPixels = 0
  for (let y = 0; y < height; y++) {
    const my = maskHeight === height ? y : Math.min(maskHeight - 1, (y * maskHeight / height) | 0)
    const maskRow = my * maskWidth
    const outRow = y * width * 4
    for (let x = 0; x < width; x++) {
      const mx = maskWidth === width ? x : Math.min(maskWidth - 1, (x * maskWidth / width) | 0)
      if (mask[maskRow + mx] > threshold) {
        const idx = outRow + x * 4
        out[idx] = person[idx]
        out[idx + 1] = person[idx + 1]
        out[idx + 2] = person[idx + 2]
        out[idx + 3] = 255
        personPixels++
      }
    }
  }
  return personPixels
}
