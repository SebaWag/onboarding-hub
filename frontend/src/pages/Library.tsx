import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Film, Clock, Play, RefreshCw, Search, Grid, List as ListIcon, Pencil, Trash2 } from 'lucide-react'
import { cn } from '../lib/utils'

interface VideoItem {
  id: string
  title: string
  status: string
  duration_seconds: number
  created_at: string
  created_by_name: string
  transcript: string | null
  storage_key?: string
  metadata?: any
}

export default function Library() {
  const navigate = useNavigate()
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [renameTarget, setRenameTarget] = useState<VideoItem | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const [filterStatus, setFilterStatus] = useState<'all' | 'ready' | 'transcribed'>('all')

  const fetchVideos = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch('/api/videos', {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      if (response.ok) {
        const data = await response.json()
        setVideos(data.data || [])
      }
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
    if (!confirm("Seguro de eliminar este video?")) return
    try {
      const token = localStorage.getItem("auth_token")
      await fetch("/api/videos/" + videoId, { method: "DELETE", headers: { "Authorization": "Bearer " + token } })
      fetchVideos()
    } catch (e) { console.error(e) }
  }

  const handleGenerateThumbnail = async (videoId: string) => {
    try {
      const token = localStorage.getItem("auth_token")
      const res = await fetch("/api/videos/" + videoId + "/generate-thumbnail", {
        method: "POST", headers: { "Authorization": "Bearer " + token }
      })
      if (res.ok) fetchVideos()
    } catch (e) { console.error(e) }
  }

  const handleRename = async () => {
    if (!renameTarget || !newTitle.trim()) return
    try {
      const token = localStorage.getItem("auth_token")
      await fetch("/api/videos/" + renameTarget.id, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() })
      })
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
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            Biblioteca de Tutoriales
          </h1>
          <p className="text-[var(--text-muted)] mt-1">{videos.length} video{videos.length !== 1 ? 's' : ''} en tu organización</p>
        </div>
        <button 
          onClick={fetchVideos} 
          className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
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
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
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
        <div className="bg-[var(--bg-card)] rounded-2xl p-12 text-center border border-[var(--border-color)] shadow-sm">
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
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md hover:shadow-lg transition-shadow"
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
              className="bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-[var(--border-color)] hover:border-teal-400/50 hover:shadow-lg transition-all cursor-pointer group shadow-sm"
            >
              {/* Thumbnail */}
              <div className="h-40 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center relative">
                <Film className="w-12 h-12 text-violet-500 group-hover:scale-110 transition-transform" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="p-4 rounded-full bg-white/30 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-8 h-8 text-white" />
                  </div>
                </div>
                {video.transcript && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/30">
                    <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">Transcrito</span>
                  </div>
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
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(video.id); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-rose-400 transition-colors" title="Eliminar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                      <span className="text-[10px] font-bold">4:3</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="flex items-center gap-1 text-[var(--text-muted)]">
                    <Clock className="w-4 h-4" />
                    {formatDuration(video.duration_seconds)}
                  </span>
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    video.status === 'ready' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' :
                    video.status === 'transcribing' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' :
                    video.status === 'failed' ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400' :
                    'bg-gray-100 dark:bg-gray-500/20 text-gray-700 dark:text-gray-400'
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
                <div className="w-16 h-12 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center shrink-0">
                  <Play className="w-5 h-5 text-violet-500" />
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
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium">Transcrito</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      
{/* Modal Renombrar */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setRenameTarget(null)}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Renombrar Video</h3>
            <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-white text-sm mb-4 focus:border-teal-500 focus:outline-none"
              placeholder="Nuevo nombre..." autoFocus />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRenameTarget(null)}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-sm">Cancelar</button>
              <button onClick={handleRename}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm font-medium hover:shadow-lg transition-all">Guardar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
