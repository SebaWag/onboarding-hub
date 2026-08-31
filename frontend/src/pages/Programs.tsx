import { useState, useEffect, useRef } from 'react'
import { Plus, Search, Grid3X3, List, Loader2, X, Eye, ChevronRight, Play, Film, FolderOpen, PlusCircle, Trash2, Link as LinkIcon } from 'lucide-react'
import { cn, mediaProxyUrl } from '../lib/utils'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { Skeleton, SkeletonCard } from '../components/Skeleton'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../lib/toast'
import { api } from '../lib/api'
import type { ApiResponse } from '../lib/api'


interface Program { id: string; title: string; description?: string; is_active: boolean; module_count: number; enrolled_users: number; created_at: string; created_by_name?: string }
interface Content { id: string; module_id: string; content_type: string; title: string; description?: string; sort_order: number; content_url?: string; video_id?: string; video_title?: string; duration_seconds?: number; video_status?: string; storage_key?: string }
interface Module { id: string; program_id: string; title: string; description?: string; sort_order: number; is_required: boolean; content_count: number; contents: Content[] }
interface Video { id: string; title: string; status: string; duration_seconds: number; storage_key?: string; thumbnail_url?: string }

export default function Programs() {
  const navigate = useNavigate()
  const toast = useToast()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState<Program[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
  const [saving, setSaving] = useState(false)
  const [modules, setModules] = useState<Module[]>([])
  const [showModuleModal, setShowModuleModal] = useState(false)
  const [moduleForm, setModuleForm] = useState({ title: '', description: '' })
  const [selectedModule, setSelectedModule] = useState<Module | null>(null)
  const [showContentModal, setShowContentModal] = useState(false)
  const [contentType, setContentType] = useState<'video' | 'link'>('video')
  const [videos, setVideos] = useState<Video[]>([])
  const [contentForm, setContentForm] = useState({ title: '', description: '', link_url: '' })
  const [playingVideo, setPlayingVideo] = useState<{ title: string; storageKey: string } | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [formData, setFormData] = useState({ title: '', description: '' })
  useEscapeKey(showCreateModal, () => setShowCreateModal(false))
  useEscapeKey(showDetailModal, () => { setShowDetailModal(false); setModules([]) })
  useEscapeKey(showModuleModal, () => setShowModuleModal(false))
  useEscapeKey(showContentModal, () => setShowContentModal(false))
  useEscapeKey(!!playingVideo, () => setPlayingVideo(null))

  useEffect(() => { fetchPrograms() }, [])

  const fetchPrograms = async () => {
    setLoading(true)
    try {
      const data = await api.get<ApiResponse<Program[]>>('/programs')
      setPrograms(data.success && data.data ? data.data : [])
    } catch (err) { console.error('Error:', err) }
    setLoading(false)
  }

  const createProgram = async () => {
    try {
      setSaving(true)
      await api.post('/programs', formData)
      await fetchPrograms(); setShowCreateModal(false); setFormData({ title: '', description: '' })
    } catch (err) { console.error('Error:', err) }
    setSaving(false)
  }

  const openProgramDetail = async (program: Program) => { setSelectedProgram(program); setShowDetailModal(true); await fetchModules(program.id) }

  const fetchModules = async (programId: string) => {
    try {
      const data = await api.get<ApiResponse<Module[]>>(`/modules/program/${programId}`)
      setModules(data.success && data.data ? data.data : [])
    } catch (err) { console.error('Error fetching modules:', err) }
  }

  const createModule = async () => {
    if (!selectedProgram || !moduleForm.title) return
    try {
      setSaving(true)
      await api.post('/modules', { program_id: selectedProgram.id, title: moduleForm.title, description: moduleForm.description })
      await fetchModules(selectedProgram.id); setShowModuleModal(false); setModuleForm({ title: '', description: '' })
    } catch (err) { console.error('Error:', err) }
    setSaving(false)
  }

  const fetchVideos = async () => {
    try {
      const data = await api.get<ApiResponse<Video[]>>('/videos')
      setVideos((data.success && data.data ? data.data : []).filter((v: Video) => v.status === 'ready'))
    } catch (err) { console.error('Error:', err) }
  }

  const addVideoToModule = async (moduleId: string, video: Video) => {
    try {
      await api.post('/contents', { module_id: moduleId, type: 'video', title: video.title, video_id: video.id, duration_seconds: video.duration_seconds })
      await fetchModules(selectedProgram!.id); setShowContentModal(false)
    } catch (err) { console.error('Error:', err); toast.error(err instanceof Error ? err.message : 'Error al agregar video') }
  }

  const addLinkToModule = async (moduleId: string) => {
    if (!contentForm.title || !contentForm.link_url) { toast.warning('Completa el título y la URL'); return }
    try {
      await api.post('/contents', { module_id: moduleId, type: 'link', title: contentForm.title, description: contentForm.description, content_url: contentForm.link_url })
      await fetchModules(selectedProgram!.id); setShowContentModal(false); setContentForm({ title: '', description: '', link_url: '' })
    } catch (err) { console.error('Error:', err); toast.error(err instanceof Error ? err.message : 'Error al agregar enlace') }
  }

  const deleteContent = async (contentId: string) => {
    const ok = await toast.confirm({
      title: '¿Eliminar este contenido?',
      description: 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await api.del(`/contents/${contentId}`)
      toast.success('Contenido eliminado correctamente')
      await fetchModules(selectedProgram!.id)
    } catch (err) {
      console.error('Error:', err)
      toast.error('No se pudo eliminar el contenido')
    }
  }

  const playVideo = (content: Content) => {
    const storageKey = content.content_url || content.storage_key
    if (!storageKey) { toast.warning('El video aún no está disponible'); return }
    setPlayingVideo({ title: content.title, storageKey })
  }

  const openContentSelector = async (mod: Module) => { setSelectedModule(mod); setShowContentModal(true); setContentType('video'); setContentForm({ title: '', description: '', link_url: '' }); await fetchVideos() }
  const openLinkForm = (mod: Module) => { setSelectedModule(mod); setShowContentModal(true); setContentType('link'); setContentForm({ title: '', description: '', link_url: '' }) }

  const filteredPrograms = programs.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
  const formatDuration = (secs: number) => secs ? `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}` : '0:00'

  if (loading) {
    return (
      <div className="animate-fade-in" aria-busy="true" aria-label="Cargando programas">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <SkeletonCard key={i} className="overflow-hidden">
              <Skeleton className="w-full h-32 rounded-none" />
              <div className="p-5">
                <Skeleton className="w-2/3 h-5" />
                <Skeleton className="w-full h-3.5 mt-3" />
                <Skeleton className="w-5/6 h-3.5 mt-2" />
                <div className="flex gap-6 mt-4 pt-4 border-t border-[var(--border)]">
                  <Skeleton className="w-12 h-8" />
                  <Skeleton className="w-12 h-8" />
                </div>
                <Skeleton className="w-full h-9 mt-4 rounded-xl" />
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Programas de Onboarding</h1>
          <p className="text-[var(--text-muted)] mt-1">Gestiona programas, módulos y contenido</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md hover:shadow-lg">
          <Plus className="w-4 h-4" /> Nuevo Programa
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input type="text" placeholder="Buscar programas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
          <button onClick={() => setViewMode('grid')} className={cn('p-2 rounded-lg transition-colors', viewMode === 'grid' ? 'bg-teal-50 text-teal-600 dark:text-teal-500' : 'text-[var(--text-muted)]')}><Grid3X3 className="w-4 h-4" /></button>
          <button onClick={() => setViewMode('list')} className={cn('p-2 rounded-lg transition-colors', viewMode === 'list' ? 'bg-teal-50 text-teal-600 dark:text-teal-500' : 'text-[var(--text-muted)]')}><List className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Programs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPrograms.map((program) => (
          <div key={program.id} className="bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-[var(--border-color)] hover:shadow-lg transition-all group shadow-sm">
            <div className="h-32 bg-gradient-to-br from-teal-500 to-cyan-500 relative overflow-hidden">
              <div className="absolute inset-0 bg-black/10" />
              <div className="absolute top-4 left-4"><span className={cn('px-2 py-1 rounded-full text-xs font-medium', program.is_active ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400')}>{program.is_active ? 'Activo' : 'Inactivo'}</span></div>
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100"><button onClick={() => openProgramDetail(program)} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white"><Eye className="w-4 h-4" /></button></div>
            </div>
            <div className="p-5">
              <h3 className="font-semibold text-[var(--text-primary)]">{program.title}</h3>
              <p className="text-sm text-[var(--text-muted)] mt-2 line-clamp-2">{program.description || 'Sin descripción'}</p>
              <div className="flex gap-4 mt-4 pt-4 border-t border-[var(--border-color)] text-center">
                <div className="flex-1"><p className="text-lg font-bold text-[var(--text-primary)]">{program.module_count || 0}</p><p className="text-[10px] text-[var(--text-muted)]">MÓDULOS</p></div>
                <div className="flex-1"><p className="text-lg font-bold text-[var(--text-primary)]">{program.enrolled_users || 0}</p><p className="text-[10px] text-[var(--text-muted)]">INSCRITOS</p></div>
              </div>
              <button onClick={() => openProgramDetail(program)} className="w-full mt-4 px-4 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-center gap-2">
                Administrar <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        <button onClick={() => setShowCreateModal(true)} className="bg-[var(--bg-card)] rounded-2xl border-2 border-dashed border-[var(--border-color)] hover:border-teal-400/50 transition-all p-8 flex flex-col items-center justify-center gap-4 min-h-[300px]">
          <Plus className="w-12 h-12 text-[var(--text-muted)]" />
          <p className="font-medium text-[var(--text-primary)]">Crear Nuevo Programa</p>
        </button>
      </div>

      {/* Create Program Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowCreateModal(false)}>
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-lg border border-[var(--border-color)] shadow-xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Nuevo Programa</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createProgram(); }} className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Título *</label>
                <input type="text" required value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" placeholder="Ej: Onboarding Odoo" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Descripción</label>
                <textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] h-24 resize-none placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" placeholder="Describe el programa..." />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-hover)]">Cancelar</button>
                <button type="submit" disabled={saving || !formData.title} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Program Detail Modal */}
      {showDetailModal && selectedProgram && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => { setShowDetailModal(false); setModules([]) }}>
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-[var(--border-color)] shadow-xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">{selectedProgram.title}</h2>
                <p className="text-sm text-[var(--text-muted)]">{selectedProgram.description || 'Sin descripción'}</p>
              </div>
              <button onClick={() => { setShowDetailModal(false); setModules([]); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-teal-500" />
                Módulos ({modules.length})
              </h3>
              <button onClick={() => setShowModuleModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm font-medium hover:bg-[var(--bg-hover)]">
                <PlusCircle className="w-4 h-4" /> Agregar Módulo
              </button>
            </div>

            {modules.length === 0 ? (
              <div className="bg-[var(--bg-secondary)] rounded-xl p-8 text-center border border-[var(--border-color)]">
                <FolderOpen className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4 opacity-50" />
                <p className="text-[var(--text-muted)]">No hay módulos todavía</p>
                <button onClick={() => setShowModuleModal(true)} className="mt-4 px-6 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md">Crear Primer Módulo</button>
              </div>
            ) : (
              <div className="space-y-4">
                {modules.map((mod, idx) => (
                  <div key={mod.id} className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-color)]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-500 font-bold">{idx + 1}</div>
                        <div>
                          <h4 className="font-semibold text-[var(--text-primary)]">{mod.title}</h4>
                          <p className="text-sm text-[var(--text-muted)]">{mod.description || 'Sin descripción'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openContentSelector(mod)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm hover:bg-[var(--bg-hover)]">
                          <Film className="w-4 h-4 text-teal-500" /> Video
                        </button>
                        <button onClick={() => openLinkForm(mod)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm hover:bg-[var(--bg-hover)]">
                          <LinkIcon className="w-4 h-4 text-emerald-500" /> Enlace
                        </button>
                      </div>
                    </div>
                    
                    {mod.contents && mod.contents.length > 0 && (
                      <div className="pl-4 border-l-2 border-teal-200 dark:border-teal-500/30 space-y-2 mt-3">
                        {mod.contents.map((content) => (
                          <div key={content.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card)]">
                            <div className="flex items-center gap-3">
                              {content.content_type === 'video' ? (
                                <button onClick={() => playVideo(content)} className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-500 hover:bg-teal-200 dark:hover:bg-teal-500/30 transition-colors">
                                  <Play className="w-5 h-5" />
                                </button>
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                  <LinkIcon className="w-5 h-5" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-[var(--text-primary)]">{content.title}</p>
                                <p className="text-xs text-[var(--text-muted)]">{content.content_type === 'video' ? `Duración: ${formatDuration(content.duration_seconds || 0)}` : content.content_url}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => deleteContent(content.id)} className="p-2 text-[var(--text-muted)] hover:text-rose-500">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video Player Modal */}
      {playingVideo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in" onClick={() => setPlayingVideo(null)}>
          <div className="w-full max-w-4xl mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{playingVideo.title}</h3>
              <button onClick={() => setPlayingVideo(null)} className="text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
            </div>
            <video ref={videoRef} key={playingVideo.storageKey} className="w-full rounded-xl" controls autoPlay src={mediaProxyUrl(playingVideo.storageKey)}>Tu navegador no soporta video.</video>
          </div>
        </div>
      )}

      {/* Create Module Modal */}
      {showModuleModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowModuleModal(false)}>
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md border border-[var(--border-color)] shadow-xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Nuevo Módulo</h2>
              <button onClick={() => setShowModuleModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createModule(); }} className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Título *</label>
                <input type="text" required value={moduleForm.title} onChange={(e) => setModuleForm({...moduleForm, title: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" placeholder="Ej: 1. Introducción" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Descripción</label>
                <textarea value={moduleForm.description} onChange={(e) => setModuleForm({...moduleForm, description: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] h-20 resize-none placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModuleModal(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-hover)]">Cancelar</button>
                <button type="submit" disabled={saving || !moduleForm.title} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Content Modal */}
      {showContentModal && selectedModule && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowContentModal(false)}>
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto border border-[var(--border-color)] shadow-xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Agregar a "{selectedModule.title}"</h2>
              <button onClick={() => setShowContentModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex gap-2 mb-4">
              <button onClick={() => setContentType('video')} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium', contentType === 'video' ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-500' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]')}>
                <Film className="w-4 h-4" /> Videos
              </button>
              <button onClick={() => setContentType('link')} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium', contentType === 'link' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]')}>
                <LinkIcon className="w-4 h-4" /> Enlace
              </button>
            </div>

            {contentType === 'video' && (
              videos.length === 0 ? (
                <div className="text-center py-8">
                  <Film className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4 opacity-50" />
                  <p className="text-[var(--text-muted)]">No hay videos disponibles</p>
                  <button onClick={() => navigate('/studio')} className="mt-4 px-6 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md">Ir al Studio para Grabar</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {videos.map((video) => (
                    <div key={video.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-500"><Play className="w-4 h-4" /></div>
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">{video.title}</p>
                          <p className="text-xs text-[var(--text-muted)]">{formatDuration(video.duration_seconds)}</p>
                        </div>
                      </div>
                      <button onClick={() => addVideoToModule(selectedModule.id, video)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm font-medium shadow-md hover:shadow-lg">
                        <Plus className="w-4 h-4" /> Agregar
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}

            {contentType === 'link' && (
              <form onSubmit={(e) => { e.preventDefault(); addLinkToModule(selectedModule.id); }} className="space-y-4">
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Título *</label>
                  <input type="text" required value={contentForm.title} onChange={(e) => setContentForm({...contentForm, title: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" placeholder="Nombre del recurso" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">URL *</label>
                  <input type="url" required value={contentForm.link_url} onChange={(e) => setContentForm({...contentForm, link_url: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Descripción</label>
                  <textarea value={contentForm.description} onChange={(e) => setContentForm({...contentForm, description: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] h-20 resize-none placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" />
                </div>
                <button type="submit" className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md hover:shadow-lg">
                  <Plus className="w-4 h-4" /> Agregar Enlace
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
