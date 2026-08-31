import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Film, Clock, Play, RefreshCw, Search, Grid, List as ListIcon, Pencil, Trash2, ImagePlus } from 'lucide-react'
import { cn } from '../lib/utils'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useToast } from '../lib/toast'
import { api } from '../lib/api'
import type { ApiResponse } from '../lib/api'

interface VideoItem {
  id: string
  title: string
  status: string
  duration_seconds: number
  created_at: string
  created_by_name: string
  transcript: string | null
  thumbnail_url?: string | null
  storage_key?: string
  metadata?: Record<string, unknown>
}

export default function Library() {
  const navigate = useNavigate()
  const toast = useToast()
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [renameTarget, setRenameTarget] = useState<VideoItem | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [filterStatus, setFilterStatus] = useState<'all' | 'ready' | 'transcribed'>('all')
  useEscapeKey(!!renameTarget, () => setRenameTarget(null))

  const fetchVideos = async () => {
    setLoading(true)
    try {
      const data = await api.get<ApiResponse<VideoItem[]>>('/videos')
      setVideos(data.data || [])
    } catch (error) {
      console.error('Error fetching videos:', error)
    }
    setLoading(false)
  }

  useEffect(() => { fetchVideos() }, [])

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins + ':' + secs.toString().padStart(2, '0')
  }

  
  const handleDelete = async (videoId: string) => {
    const ok = await toast.confirm({
      title: '¿Eliminar este video?',
      description: 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await api.del('/videos/' + videoId)
      toast.success('Video eliminado correctamente')
      fetchVideos()
    } catch (e) {
      console.error(e)
      toast.error('No se pudo eliminar el video')
    }
  }

  const handleGenerateThumbnail = async (videoId: string) => {
    try {
      await api.post('/videos/' + videoId + '/generate-thumbnail')
      fetchVideos()
    } catch (e) { console.error(e) }
  }

  const handleRename = async () => {
    if (!renameTarget || !newTitle.trim()) return
    try {
      await api.put('/videos/' + renameTarget.id, { title: newTitle.trim() })
      setRenameTarget(null); setNewTitle(""); fetchVideos()
    } catch (e) { console.error(e) }
  }
  const filteredVideos = videos.filter(v => {
    const matchesSearch = !searchQuery || v.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'ready' && v.status === 'ready') ||
      (filterStatus === 'transcribed' && v.transcript)
    return matchesSearch && matchesFilter
  })

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h1 className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            Biblioteca de Tutoriales
          </h1>
          <p className="text-[var(--text-muted)] mt-1">{videos.length} video{videos.length !== 1 ? 's' : ''} en tu organización</p>
        </div>
        <button 
          onClick={fetchVideos} 
          className="btn-ghost btn-icon"
        >
          <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar videos..."
            className="input pl-10 pr-4"
          />
        </div>
        
        {/* Status filters */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
          {([
            { id: 'all' as const, label: 'Todos' },
            { id: 'ready' as const, label: 'Listos' },
            { id: 'transcribed' as const, label: 'Transcritos' },
          ]).map(f => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filterStatus === f.id 
                  ? 'bg-teal-50 text-teal-600 dark:text-teal-500' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        
        {/* View mode toggle */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]">
          <button 
            onClick={() => setViewMode('grid')} 
            className={cn(
              'p-1.5 rounded-md transition-colors',
              viewMode === 'grid' ? 'bg-teal-50 text-teal-600 dark:text-teal-500' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setViewMode('list')} 
            className={cn(
              'p-1.5 rounded-md transition-colors',
              viewMode === 'list' ? 'bg-teal-50 text-teal-600 dark:text-teal-500' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            <ListIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Videos */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-[var(--border-color)] animate-pulse shadow-sm">
              <div className="h-40 bg-[var(--bg-secondary)]" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-[var(--bg-secondary)] rounded w-3/4" />
                <div className="h-3 bg-[var(--bg-secondary)] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="empty-state">
          <Film className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            {searchQuery ? 'Sin resultados' : 'No hay videos todavía'}
          </h3>
          <p className="text-[var(--text-muted)] mb-6">
            {searchQuery ? 'Intenta con otra búsqueda' : 'Graba tu primer tutorial para comenzar'}
          </p>
          {!searchQuery && (
            <button 
              onClick={() => navigate('/studio')} 
              className="btn-primary px-6 py-3"
            >
              Ir al Studio
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map((video) => (
            <div
              key={video.id}
              onClick={() => navigate(`/video/${video.id}`)}
              className="card card-hover p-0 overflow-hidden cursor-pointer group"
            >
              {/* Thumbnail: portada real o logo WS */}
              <div className="h-40 bg-[var(--bg-card)] flex items-center justify-center relative overflow-hidden">
                <img
                  src={video.thumbnail_url || '/logo-poster.png'}
                  alt={video.title || 'Wagner Solutions'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="p-4 rounded-full bg-white/30 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-8 h-8 text-white" />
                  </div>
                </div>
                {video.transcript && (
                  <div className="absolute top-2 right-2 badge badge-emerald">Transcrito</div>
                )}
              </div>
              
              {/* Info */}
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-[var(--text-primary)] truncate group-hover:text-teal-600 dark:group-hover:text-teal-500 transition-colors flex-1">{video.title}</h3>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); setRenameTarget(video); setNewTitle(video.title); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-teal-500 transition-colors" title="Renombrar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleGenerateThumbnail(video.id); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-emerald-400 transition-colors" title="Generar portada">
                      <ImagePlus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(video.id); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-rose-400 transition-colors" title="Eliminar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="flex items-center gap-1 text-[var(--text-muted)]">
                    <Clock className="w-4 h-4" />
                    {formatDuration(video.duration_seconds)}
                  </span>
                  <span className={cn('badge',
                    video.status === 'ready' ? 'badge-emerald' :
                    video.status === 'transcribing' ? 'badge-amber' :
                    video.status === 'failed' ? 'badge-rose' :
                    'badge-gray'
                  )}>
                    {video.status === 'ready' ? 'Listo' : video.status === 'transcribing' ? 'Transcribiendo' : video.status === 'failed' ? 'Error' : video.status}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  {new Date(video.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-[var(--border-color)] shadow-sm">
          <div className="divide-y divide-[var(--border-color)]">
            {filteredVideos.map((video) => (
              <div
                key={video.id}
                onClick={() => navigate(`/video/${video.id}`)}
                className="flex items-center gap-4 p-4 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
              >
                <div className="w-16 h-12 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center shrink-0 overflow-hidden">
                  <img src="/logo-poster.png" alt="WS" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-[var(--text-primary)] truncate group-hover:text-teal-600 dark:group-hover:text-teal-500 transition-colors">{video.title}</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {new Date(video.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {formatDuration(video.duration_seconds)}
                  </span>
                  {video.transcript && (
                    <span className="badge badge-emerald">Transcrito</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      
{/* Modal Renombrar */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setRenameTarget(null)}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-2xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text)] mb-4">Renombrar Video</h3>
            <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              className="input mb-4"
              placeholder="Nuevo nombre..." autoFocus />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRenameTarget(null)}
                className="btn-secondary">Cancelar</button>
              <button onClick={handleRename}
                className="btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
