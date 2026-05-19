import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Folder, FileText, Table, Presentation, FileArchive, Image, Receipt, Video,
  Upload, Download, Search, X, Clock, User, Trash2, Eye, 
  ChevronRight, Home, FileSpreadsheet, File, Film, Type
} from 'lucide-react'
import { cn } from '../lib/utils'

const API_URL = '/api'

// Categorías con sus íconos
const CATEGORY_CONFIG: Record<string, { icon: any; color: string; bgColor: string }> = {
  documents: { icon: FileText, color: '#3b82f6', bgColor: 'bg-blue-500/10' },
  spreadsheets: { icon: Table, color: '#10b981', bgColor: 'bg-emerald-500/10' },
  presentations: { icon: Presentation, color: '#f59e0b', bgColor: 'bg-amber-500/10' },
  pdfs: { icon: FileArchive, color: '#ef4444', bgColor: 'bg-rose-500/10' },
  images: { icon: Image, color: '#8b5cf6', bgColor: 'bg-violet-500/10' },
  invoices: { icon: Receipt, color: '#06b6d4', bgColor: 'bg-cyan-500/10' },
  multimedia: { icon: Video, color: '#ec4899', bgColor: 'bg-pink-500/10' },
}

// Íconos por tipo de archivo
const FILE_TYPE_ICONS: Record<string, { icon: any; color: string }> = {
  pdf: { icon: FileText, color: 'text-rose-400' },
  docx: { icon: Type, color: 'text-blue-400' },
  doc: { icon: Type, color: 'text-blue-400' },
  xlsx: { icon: FileSpreadsheet, color: 'text-emerald-400' },
  xls: { icon: FileSpreadsheet, color: 'text-emerald-400' },
  csv: { icon: FileSpreadsheet, color: 'text-emerald-400' },
  pptx: { icon: Presentation, color: 'text-amber-400' },
  ppt: { icon: Presentation, color: 'text-amber-400' },
  png: { icon: Image, color: 'text-teal-500' },
  jpg: { icon: Image, color: 'text-teal-500' },
  jpeg: { icon: Image, color: 'text-teal-500' },
  svg: { icon: Image, color: 'text-teal-500' },
  gif: { icon: Image, color: 'text-teal-500' },
  mp4: { icon: Film, color: 'text-pink-400' },
  webm: { icon: Film, color: 'text-pink-400' },
  mov: { icon: Film, color: 'text-pink-400' },
}

interface Category {
  id: string
  name: string
  description?: string
  icon: string
  color: string
  extensions: string
  sort_order: number
  resource_count: number
}

interface Resource {
  id: number
  name: string
  description: string
  category_id: string
  category_name: string
  file_type: string
  file_size: number
  mime_type: string
  storage_path: string
  tags: string[]
  uploaded_by: number
  uploader_name: string
  uploader_email: string
  created_at: string
  updated_at: string
  preview_url?: string
  download_url?: string
}

interface Stats {
  total_resources: number
  by_category: Array<{ id: string; name: string; icon: string; color: string; count: number }>
  recent_uploads: Resource[]
  total_size_bytes: number
  total_size_mb: string
}

export default function Templates() {
  const [view, setView] = useState<'categories' | 'files'>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  
  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  
  // Modal de upload
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    name: '',
    description: '',
    category_id: '',
    tags: ''
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  
  // Modal de preview
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewData, setPreviewData] = useState<{ type?: string; name?: string; message?: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<HTMLDivElement>(null)

  // Cargar categorías
  const fetchCategories = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/resources/categories`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        setCategories(data.data)
      }
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }, [])

  // Cargar recursos
  const fetchResources = useCallback(async (categoryId?: string, search?: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      const params = new URLSearchParams()
      if (categoryId) params.append('category_id', categoryId)
      if (search) params.append('search', search)

      const response = await fetch(`${API_URL}/resources?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        setResources(data.data)
      }
    } catch (error) {
      console.error('Error fetching resources:', error)
    }
  }, [])

  // Cargar estadísticas
  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/resources/stats/summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        setStats(data.data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }, [])

  // Inicializar
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await fetchCategories()
      await fetchStats()
      setLoading(false)
    }
    init()
  }, [fetchCategories, fetchStats])

  // Búsqueda global
  useEffect(() => {
    if (globalSearch.length >= 2) {
      fetchResources(undefined, globalSearch)
      setView('files')
      setSelectedCategory(null)
    }
  }, [globalSearch, fetchResources])

  // Navegación
  const goToCategory = (category: Category) => {
    setSelectedCategory(category)
    setView('files')
    setSearchQuery('')
    fetchResources(category.id)
  }

  const goBack = () => {
    setView('categories')
    setSelectedCategory(null)
    setSearchQuery('')
    fetchCategories()
    fetchStats()
  }

  // Handlers de drag & drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      setSelectedFile(file)
      if (!uploadForm.name) {
        setUploadForm(prev => ({ ...prev, name: file.name.replace(/\.[^/.]+$/, '') }))
      }
    }
  }, [uploadForm.name])

  // Upload
  const handleUpload = async () => {
    if (!selectedFile || !uploadForm.category_id || !uploadForm.name) {
      alert('Por favor completa todos los campos obligatorios')
      return
    }

    setUploading(true)
    try {
      const token = localStorage.getItem('auth_token')
      const formData = new FormData()
      formData.append('name', uploadForm.name)
      formData.append('description', uploadForm.description)
      formData.append('category_id', uploadForm.category_id)
      formData.append('tags', uploadForm.tags)
      formData.append('file', selectedFile)

      const response = await fetch(`${API_URL}/resources`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      const data = await response.json()
      
      if (data.success) {
        setShowUploadModal(false)
        setUploadForm({ name: '', description: '', category_id: '', tags: '' })
        setSelectedFile(null)
        
        if (selectedCategory) {
          fetchResources(selectedCategory.id)
        } else {
          fetchCategories()
        }
        fetchStats()
      } else {
        alert(data.error || 'Error al subir recurso')
      }
    } catch (error) {
      console.error('Error uploading:', error)
      alert('Error al subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  // Preview - obtiene info del archivo
  const handlePreview = async (resource: Resource) => {
    if (!resource.storage_path) return
    
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/resources/${resource.id}/preview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      // Si es una imagen o PDF, el backend devuelve los bytes directamente
      if (response.headers.get('content-type')?.startsWith('image/') || 
          response.headers.get('content-type') === 'application/pdf') {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        setPreviewData({ 
          type: response.headers.get('content-type') || resource.mime_type,
          name: resource.name 
        })
        // Abrir en nueva ventana
        window.open(url, '_blank')
        return
      }
      
      // Para otros tipos, devuelve JSON con info
      const data = await response.json()
      if (data.success) {
        setPreviewData(data.data)
        setShowPreviewModal(true)
      } else {
        alert(data.error || 'Error al obtener preview')
      }
    } catch (error) {
      console.error('Error preview:', error)
      alert('Error al visualizar el archivo')
    }
  }

  // Descargar - obtiene el archivo y lo descarga
  const handleDownload = async (resource: Resource) => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/resources/${resource.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!response.ok) {
        throw new Error('Error en la descarga')
      }
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${resource.name}.${resource.file_type}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading:', error)
      alert('Error al descargar el archivo')
    }
  }

  // Eliminar
  const handleDelete = async (resource: Resource) => {
    if (!confirm(`¿Eliminar "${resource.name}"?`)) return
    
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`${API_URL}/resources/${resource.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (selectedCategory) {
        fetchResources(selectedCategory.id)
      }
      fetchCategories()
      fetchStats()
    } catch (error) {
      console.error('Error deleting:', error)
    }
  }

  // Formatear tamaño
  const formatSize = (bytes: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Formatear fecha
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  // Obtener ícono de categoría
  const getCategoryIcon = (iconName: string) => {
    const icons: Record<string, any> = {
      FileText, Table, Presentation, FileArchive, Image, Receipt, Video, Folder
    }
    return icons[iconName] || Folder
  }

  const filteredResources = searchQuery 
    ? resources.filter(r => 
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : resources

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view === 'files' && (
            <button onClick={goBack} className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Folder className="w-5 h-5 text-[var(--text-primary)]" />
              </div>
              Biblioteca Corporativa
            </h1>
            <p className="text-[var(--text-muted)] mt-1">Repositorio de documentos y plantillas oficiales</p>
          </div>
        </div>
        
        <button onClick={() => setShowUploadModal(true)} className="btn-primary">
          <Upload className="w-4 h-4 mr-2" />
          Subir Recurso
        </button>
      </div>

      {/* Barra de búsqueda global */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Buscar en todas las categorías..."
            className="input-field pl-12 w-full"
          />
          {globalSearch && (
            <button 
              onClick={() => { setGlobalSearch(''); setView('categories'); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stats rápido */}
      {stats && view === 'categories' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-[var(--text-primary)]">{stats.total_resources}</p>
            <p className="text-sm text-[var(--text-muted)]">Recursos</p>
          </div>
          {stats.by_category.slice(0, 3).map((cat) => {
            const config = CATEGORY_CONFIG[cat.id] || { icon: Folder, color: '#6b7280', bgColor: 'bg-gray-500/10' }
            const Icon = getCategoryIcon(cat.icon)
            return (
              <div key={cat.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', config.bgColor)}>
                  <Icon className="w-5 h-5" style={{ color: config.color }} />
                </div>
                <div>
                  <p className="text-xl font-bold text-[var(--text-primary)]">{cat.count}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{cat.name}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Breadcrumb */}
      {view === 'files' && selectedCategory && (
        <div className="flex items-center gap-2 text-sm">
          <button onClick={goBack} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1">
            <Home className="w-4 h-4" />
            Biblioteca
          </button>
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="text-[var(--text-primary)] font-medium">{selectedCategory.name}</span>
        </div>
      )}

      {/* Vista de Categorías (Folders) */}
      {view === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((category) => {
            const config = CATEGORY_CONFIG[category.id] || { icon: Folder, color: '#6b7280', bgColor: 'bg-gray-500/10' }
            const Icon = getCategoryIcon(category.icon)
            return (
              <button
                key={category.id}
                onClick={() => goToCategory(category)}
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 hover:border-violet-500/30 transition-all group text-left"
              >
                <div className="flex items-start gap-4">
                  <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center shrink-0', config.bgColor)}>
                    <Icon className="w-7 h-7" style={{ color: config.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-teal-500 transition-colors">
                      {category.name}
                    </h3>
                    <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">
                      {category.description || `${category.resource_count} recursos`}
                    </p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-2xl font-bold" style={{ color: config.color }}>
                        {category.resource_count}
                      </span>
                      <ChevronRight className="w-5 h-5 text-[var(--text-muted)] group-hover:text-teal-500 transition-colors" />
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Vista de Archivos */}
      {view === 'files' && (
        <div className="space-y-4">
          {/* Filtros de categoría */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Buscar en ${selectedCategory?.name || 'recursos'}...`}
                  className="input-field pl-10 w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-muted)]">{filteredResources.length} archivos</span>
              </div>
            </div>
          </div>

          {/* Grid de recursos */}
          {filteredResources.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredResources.map((resource) => {
                const typeConfig = FILE_TYPE_ICONS[resource.file_type] || { icon: File, color: 'text-[var(--text-muted)]' }
                const TypeIcon = typeConfig.icon
                const catConfig = CATEGORY_CONFIG[resource.category_id] || { color: '#6b7280' }
                
                return (
                  <div
                    key={resource.id}
                    className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 hover:border-violet-500/30 transition-all group"
                  >
                    {/* Preview del archivo */}
                    <div 
                      className="aspect-square rounded-lg mb-4 flex items-center justify-center relative overflow-hidden cursor-pointer"
                      style={{ backgroundColor: `${catConfig.color}10` }}
                      onClick={() => resource.storage_path && handlePreview(resource)}
                    >
                      <TypeIcon className={cn('w-16 h-16', typeConfig.color)} />
                      
                      {/* Overlay en hover */}
                      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handlePreview(resource); }}
                          className="p-2 rounded-lg bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] transition-colors"
                          title="Vista previa"
                        >
                          <Eye className="w-5 h-5 text-[var(--text-primary)]" />
                        </button>
                      </div>
                      
                      {/* Badge de tipo */}
                      <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/50 backdrop-blur-sm text-xs text-[var(--text-primary)] font-medium uppercase">
                        {resource.file_type}
                      </div>
                    </div>
                    
                    {/* Info del archivo */}
                    <h4 className="font-medium text-[var(--text-primary)] truncate" title={resource.name}>
                      {resource.name}
                    </h4>
                    
                    <div className="flex items-center gap-2 mt-2 text-xs text-[var(--text-muted)]">
                      <User className="w-3 h-3" />
                      <span className="truncate">{resource.uploader_name}</span>
                    </div>
                    
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <Clock className="w-3 h-3" />
                        {formatDate(resource.created_at)}
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatSize(resource.file_size)}
                      </span>
                    </div>
                    
                    {/* Tags */}
                    {resource.tags && resource.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {resource.tags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] text-[10px] text-[var(--text-muted)]">
                            {tag}
                          </span>
                        ))}
                        {resource.tags.length > 3 && (
                          <span className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] text-[10px] text-[var(--text-muted)]">
                            +{resource.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Acciones */}
                    <div className="flex gap-2 mt-4">
                      <button 
                        onClick={() => handleDownload(resource)}
                        className="flex-1 btn-secondary py-2 text-sm"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Descargar
                      </button>
                      <button 
                        onClick={() => handleDelete(resource)}
                        className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-12 text-center">
              <Folder className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                {searchQuery ? 'Sin resultados' : 'Categoría vacía'}
              </h3>
              <p className="text-[var(--text-muted)] mb-4">
                {searchQuery 
                  ? `No se encontraron archivos para "${searchQuery}"`
                  : 'Aún no hay archivos en esta categoría'}
              </p>
              {!searchQuery && (
                <button 
                  onClick={() => {
                    setUploadForm(prev => ({ ...prev, category_id: selectedCategory?.id || '' }))
                    setShowUploadModal(true)
                  }}
                  className="btn-primary"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Subir primer archivo
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de Upload */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Subir Recurso</h2>
              <button onClick={() => setShowUploadModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Selector de categoría */}
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">
                  Categoría <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((cat) => {
                    const config = CATEGORY_CONFIG[cat.id] || { icon: Folder, color: '#6b7280', bgColor: 'bg-gray-500/10' }
                    const Icon = getCategoryIcon(cat.icon)
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setUploadForm(prev => ({ ...prev, category_id: cat.id }))}
                        className={cn(
                          'p-3 rounded-lg border transition-all flex items-center gap-2',
                          uploadForm.category_id === cat.id 
                            ? 'border-violet-500 bg-violet-500/10' 
                            : 'border-white/10 hover:border-white/20'
                        )}
                      >
                        <Icon className="w-4 h-4" style={{ color: config.color }} />
                        <span className="text-sm text-[var(--text-primary)] truncate">{cat.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Drag & Drop */}
              <div
                ref={dragRef}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                  dragActive ? 'border-violet-500 bg-violet-500/10' : 'border-white/10 hover:border-white/20',
                  selectedFile && 'border-emerald-500 bg-emerald-500/10'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setSelectedFile(e.target.files[0])
                      if (!uploadForm.name) {
                        setUploadForm(prev => ({ ...prev, name: e.target.files![0].name.replace(/\.[^/.]+$/, '') }))
                      }
                    }
                  }}
                  accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.svg,.mp4,.webm,.mov"
                />
                
                {selectedFile ? (
                  <div>
                    <File className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                    <p className="text-[var(--text-primary)] font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {formatSize(selectedFile.size)}
                    </p>
                    <p className="text-xs text-emerald-400 mt-2">Click para cambiar archivo</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-[var(--text-primary)] font-medium">Arrastra el archivo aquí</p>
                    <p className="text-sm text-[var(--text-muted)] mt-1">o haz click para seleccionar</p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      PDF, DOCX, XLSX, PPTX, PNG, JPG, SVG, MP4 (max 50MB)
                    </p>
                  </div>
                )}
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">
                  Nombre <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, name: e.target.value }))}
                  className="input-field w-full bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)]"
                  placeholder="Nombre del recurso"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">Descripción</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                  className="input-field w-full bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] h-20 resize-none"
                  placeholder="Descripción opcional..."
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">Tags</label>
                <input
                  type="text"
                  value={uploadForm.tags}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, tags: e.target.value }))}
                  className="input-field w-full bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)]"
                  placeholder="Separados por coma: contrato, legal, 2024"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowUploadModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button 
                onClick={handleUpload} 
                disabled={uploading || !selectedFile || !uploadForm.name || !uploadForm.category_id}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Subiendo...
                  </span>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Subir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Preview (para archivos sin preview nativa) */}
      {showPreviewModal && previewData && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">{previewData.name}</h3>
              <button 
                onClick={() => { setShowPreviewModal(false); setPreviewData(null); }}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-center py-8">
              <File className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
              <p className="text-[var(--text-muted)]">{previewData.message || 'Preview no disponible'}</p>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                Tipo: {previewData.type}
              </p>
            </div>
            <button 
              onClick={() => { setShowPreviewModal(false); setPreviewData(null); }}
              className="btn-primary w-full"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
