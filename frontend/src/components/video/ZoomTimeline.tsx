import { useCallback, useEffect, useState } from 'react'
import { ZoomIn, Sparkles, Plus, Trash2, Save, Loader2, Film, Download } from 'lucide-react'
import { cn, mediaProxyUrl } from '../../lib/utils'
import { api } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { ZOOM_DEPTH_SCALES, suggestZoomRegions } from '../../lib/zoom'
import type { CursorTelemetryPoint, ZoomDepth, ZoomRegion } from '../../lib/zoom'

const DEPTH_OPTIONS: ZoomDepth[] = [1, 2, 3, 4, 5, 6]
const DEFAULT_NEW_DEPTH: ZoomDepth = 3
/** Duración de una región creada a mano (ms). */
const MANUAL_REGION_MS = 3000

interface ZoomRenderState {
  status: 'idle' | 'rendering' | 'done' | 'error'
  progress: number
  message?: string
  key?: string
}

interface ZoomTimelineProps {
  /** Id del video (para exportar el render). */
  videoId: string
  regions: ZoomRegion[]
  /** Cambios inmediatos (el padre persiste con debounce). */
  onChange: (regions: ZoomRegion[]) => void
  duration: number
  currentTime: number
  telemetry: CursorTelemetryPoint[] | null
  onSeek: (seconds: number) => void
  saving?: boolean
}

function formatSec(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Panel de edición de las regiones de zoom automático:
 * timeline, ajuste de profundidad, borrado, crear a mano y "Sugerir zooms".
 */
export default function ZoomTimeline({
  videoId,
  regions,
  onChange,
  duration,
  currentTime,
  telemetry,
  onSeek,
  saving = false,
}: ZoomTimelineProps) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [render, setRender] = useState<ZoomRenderState>({ status: 'idle', progress: 0 })
  const durationMs = Math.max(1, duration * 1000)

  // Estado inicial del render (por si ya se exportó antes)
  useEffect(() => {
    let active = true
    api
      .get<{ success: boolean; data?: ZoomRenderState }>(`/videos/${videoId}/zoom-render`)
      .then((res) => {
        if (active && res.success && res.data) setRender(res.data)
      })
      .catch(() => { /* sin render previo */ })
    return () => {
      active = false
    }
  }, [videoId])

  // Polling mientras renderiza
  useEffect(() => {
    if (render.status !== 'rendering') return
    const timer = window.setInterval(() => {
      api
        .get<{ success: boolean; data?: ZoomRenderState }>(`/videos/${videoId}/zoom-render`)
        .then((res) => {
          if (res.success && res.data) setRender(res.data)
        })
        .catch(() => { /* reintenta en el próximo tick */ })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [render.status, videoId])

  const handleExport = useCallback(async () => {
    try {
      const res = await api.post<{ success: boolean; data?: ZoomRenderState }>(
        `/videos/${videoId}/zoom-render`,
      )
      if (res.success && res.data) {
        setRender(res.data)
        toast.info('Renderizando el video con zoom…')
      }
    } catch (err) {
      console.warn('[ZOOM] No se pudo iniciar el render:', err)
      toast.error('No se pudo iniciar la exportación')
    }
  }, [videoId, toast])

  const sorted = [...regions].sort((a, b) => a.startMs - b.startMs)

  const handleSuggest = () => {
    if (!telemetry || telemetry.length < 2) {
      toast.info('Este video no tiene telemetría de cursor suficiente para sugerir zooms')
      return
    }
    setBusy(true)
    try {
      const suggested = suggestZoomRegions(telemetry, durationMs)
      if (suggested.length === 0) {
        toast.info('No se detectaron momentos de interés')
        return
      }
      onChange(suggested)
      toast.success(`Se sugirieron ${suggested.length} zonas de zoom`)
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = () => {
    const center = currentTime * 1000
    const startMs = Math.max(0, Math.round(center - MANUAL_REGION_MS / 2))
    const endMs = Math.min(durationMs, Math.round(center + MANUAL_REGION_MS / 2))
    if (endMs - startMs < 200) {
      toast.warning('Acércate al centro del video para agregar un zoom')
      return
    }
    onChange([
      ...regions,
      {
        id: `zoom-manual-${Date.now()}`,
        startMs,
        endMs,
        depth: DEFAULT_NEW_DEPTH,
        focus: { cx: 0.5, cy: 0.5 },
        mode: 'manual',
      },
    ])
  }

  const updateDepth = (id: string, depth: ZoomDepth) => {
    onChange(regions.map((r) => (r.id === id ? { ...r, depth } : r)))
  }

  const remove = (id: string) => {
    onChange(regions.filter((r) => r.id !== id))
  }

  const handleStripClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    onSeek(Math.max(0, Math.min(1, ratio)) * duration)
  }

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
            <ZoomIn className="w-5 h-5 text-teal-500" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text)] leading-tight">Zoom automático</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {sorted.length} {sorted.length === 1 ? 'zona' : 'zonas'} · se guarda solo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSuggest}
            disabled={busy}
            className="btn-secondary gap-2 py-2 px-3 text-sm"
            title="Detectar zonas de zoom desde el movimiento del cursor"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Sugerir zooms
          </button>
          <button onClick={handleAdd} className="btn-secondary gap-2 py-2 px-3 text-sm" title="Agregar un zoom aquí">
            <Plus className="w-4 h-4" />
            Agregar
          </button>
          <span className={cn('flex items-center gap-1.5 text-xs', saving ? 'text-teal-500' : 'text-[var(--text-muted)]')}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Guardando…' : 'Guardado'}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div>
        <div
          className="relative h-9 rounded-lg bg-[var(--bg-hover)] cursor-pointer overflow-hidden border border-[var(--border-color)]"
          onClick={handleStripClick}
          title="Click para saltar a ese punto"
        >
          {sorted.map((r) => (
            <div
              key={r.id}
              className={cn(
                'absolute top-1 bottom-1 rounded-md border transition-colors',
                r.mode === 'manual'
                  ? 'bg-indigo-500/30 border-indigo-400/50'
                  : 'bg-teal-500/30 border-teal-400/50',
              )}
              style={{
                left: `${(r.startMs / durationMs) * 100}%`,
                width: `${Math.max(0.6, ((r.endMs - r.startMs) / durationMs) * 100)}%`,
              }}
              title={`${formatSec(r.startMs)} → ${formatSec(r.endMs)}`}
            />
          ))}
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
            style={{ left: `${Math.min(100, (currentTime * 1000 / durationMs) * 100)}%` }}
          />
        </div>
      </div>

      {/* Exportar con zoom */}
      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-[var(--border-color)]">
        <button
          onClick={handleExport}
          disabled={render.status === 'rendering' || sorted.length === 0}
          className="btn-secondary gap-2 py-2 px-3 text-sm disabled:opacity-50"
          title="Hornear el zoom en un MP4 para compartir/descargar"
        >
          {render.status === 'rendering' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
          {render.status === 'rendering' ? `Renderizando ${render.progress}%` : 'Exportar con zoom'}
        </button>
        {render.status === 'done' && render.key && (
          <a href={mediaProxyUrl(render.key)} download className="btn-primary gap-2 py-2 px-3 text-sm">
            <Download className="w-4 h-4" />
            Descargar MP4
          </a>
        )}
        {render.status === 'error' && (
          <span className="text-xs text-rose-400 max-w-full truncate" title={render.message}>
            {render.message || 'Error al exportar'}
          </span>
        )}
      </div>

      {/* Lista de regiones */}
      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">
          Sin zonas de zoom. Usá <span className="text-teal-500 font-medium">Sugerir zooms</span> o agregá una a mano.
        </p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {sorted.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-hover)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <button
                onClick={() => onSeek(r.startMs / 1000)}
                className="font-mono text-xs text-teal-500 hover:text-teal-300 transition-colors whitespace-nowrap"
                title="Ir a esta zona"
              >
                {formatSec(r.startMs)}–{formatSec(r.endMs)}
              </button>
              <span className={cn('badge text-[10px]', r.mode === 'manual' ? 'badge-blue' : 'badge-teal')}>
                {r.mode === 'manual' ? 'manual' : 'auto'}
              </span>
              <div className="flex-1" />
              <select
                value={r.depth}
                onChange={(e) => updateDepth(r.id, Number(e.target.value) as ZoomDepth)}
                className="text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md px-2 py-1 text-[var(--text)]"
                title="Profundidad del zoom"
              >
                {DEPTH_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {ZOOM_DEPTH_SCALES[d].toFixed(2)}×
                  </option>
                ))}
              </select>
              <button
                onClick={() => remove(r.id)}
                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Borrar zona"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
