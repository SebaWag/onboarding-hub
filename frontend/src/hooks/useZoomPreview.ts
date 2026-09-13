import { useEffect } from 'react'
import type { RefObject } from 'react'
import { computeZoomFrame, zoomFrameToCss } from '../lib/zoom'
import type { CursorTelemetryPoint, ZoomRegion } from '../lib/zoom'

interface UseZoomPreviewOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  regions: ZoomRegion[]
  telemetry?: CursorTelemetryPoint[] | null
  enabled: boolean
}

/**
 * Aplica el zoom de las regiones guardadas al <video> durante la reproducción.
 *
 * Lo hace de forma IMPERATIVA (escribiendo `el.style.transform` en un rAF a 60fps)
 * en vez de vía estado de React: así el zoom es fluido y no re-renderiza la página
 * en cada frame. Solo corre mientras el video está reproduciendo.
 */
export function useZoomPreview({
  videoRef,
  regions,
  telemetry,
  enabled,
}: UseZoomPreviewOptions): void {
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const apply = () => {
      if (!enabled || regions.length === 0) {
        el.style.transform = 'none'
        return
      }
      const frame = computeZoomFrame(regions, el.currentTime * 1000, telemetry)
      const css = zoomFrameToCss(frame)
      el.style.transform = css.transform
      el.style.transformOrigin = css.transformOrigin
    }

    let raf = 0
    const loop = () => {
      apply()
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
      apply()
    }

    apply()
    el.addEventListener('play', start)
    el.addEventListener('playing', start)
    el.addEventListener('pause', stop)
    el.addEventListener('ended', stop)
    el.addEventListener('seeked', apply)
    if (!el.paused) start()

    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('play', start)
      el.removeEventListener('playing', start)
      el.removeEventListener('pause', stop)
      el.removeEventListener('ended', stop)
      el.removeEventListener('seeked', apply)
      el.style.transform = 'none'
    }
  }, [videoRef, regions, telemetry, enabled])
}
