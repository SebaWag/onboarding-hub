import { useState, useEffect } from 'react'

import {
  GitBranch, Plus, Play, CheckCircle2, Clock, AlertCircle, ChevronRight,
  FileText, Video, HelpCircle, CheckSquare,
  X, ArrowRight, BarChart3, Target, Layers
} from 'lucide-react'
import { cn } from '../lib/utils'

const API_URL = '/api'

interface Flow {
  id: string
  name: string
  description: string
  role_type: 'ejecutivo' | 'tecnico' | 'comercial' | 'general'
  program_id: string
  program_name?: string
  status: 'active' | 'inactive' | 'archived'
  estimated_days: number
  steps?: FlowStep[]
  checklists?: Checklist[]
  created_at: string
}

interface FlowStep {
  id: string
  flow_id: string
  name: string
  description: string
  step_order: number
  step_type: 'task' | 'video' | 'quiz' | 'document' | 'approval'
  is_required: boolean
  estimated_hours: number
}

interface FlowTemplate {
  id: string
  name: string
  description: string
  role_type: string
  template_data: any
}

interface Checklist {
  id: string
  name: string
  checklist_type: string
  items?: ChecklistItem[]
  completion_percentage?: number
}

interface ChecklistItem {
  id: string
  item_text: string
  item_order: number
  is_required: boolean
  is_completed: boolean
}

interface UserProgress {
  id: string
  flow_id: string
  status: string
  progress_percentage: number
  started_at: string
  completed_at?: string
  current_step_id?: string
  steps?: StepProgress[]
}

interface StepProgress {
  id: string
  step_id: string
  step_name: string
  step_type: string
  step_order: number
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked'
  score?: number
}

interface Metrics {
  total_flows: number
  in_progress: number
  completed: number
  avg_completion: string
  by_role: Array<{ role_type: string; users: number; avg_progress: number }>
  pending_approvals: number
}

const roleColors = {
  ejecutivo: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  tecnico: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  comercial: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  general: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' }
}

const roleLabels = {
  ejecutivo: 'Ejecutivo',
  tecnico: 'Técnico',
  comercial: 'Comercial',
  general: 'General'
}

const stepTypeIcons = {
  task: CheckSquare,
  video: Video,
  quiz: HelpCircle,
  document: FileText,
  approval: CheckCircle2
}

const stepTypeLabels = {
  task: 'Tarea',
  video: 'Video',
  quiz: 'Quiz',
  document: 'Documento',
  approval: 'Aprobación'
}

export default function Flows() {
  const [flows, setFlows] = useState<Flow[]>([])
  const [templates, setTemplates] = useState<FlowTemplate[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null)
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [filterRole, setFilterRole] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'flows' | 'templates' | 'metrics'>('flows')

  const [newFlow, setNewFlow] = useState({
    name: '',
    description: '',
    role_type: 'general' as const,
    estimated_days: 30
  })

  useEffect(() => {
    fetchFlows()
    fetchTemplates()
    fetchMetrics()
  }, [filterRole])

  const fetchFlows = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const params = new URLSearchParams()
      if (filterRole) params.append('role_type', filterRole)

      const response = await fetch(`${API_URL}/flows?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) setFlows(data.data)
    } catch (error) {
      console.error('Error fetching flows:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/flows/templates/list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) setTemplates(data.data)
    } catch (error) {
      console.error('Error fetching templates:', error)
    }
  }

  const fetchMetrics = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/flows/metrics/overview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) setMetrics(data.data)
    } catch (error) {
      console.error('Error fetching metrics:', error)
    }
  }

  const fetchFlowDetails = async (flowId: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/flows/${flowId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        setSelectedFlow(data.data)
        fetchUserProgress(flowId)
      }
    } catch (error) {
      console.error('Error fetching flow details:', error)
    }
  }

  const fetchUserProgress = async (flowId: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/flows/${flowId}/progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success && data.data) setUserProgress(data.data)
    } catch (error) {
      console.error('Error fetching progress:', error)
    }
  }

  const createFlow = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/flows`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newFlow)
      })
      const data = await response.json()
      if (data.success) {
        fetchFlows()
        setShowCreateModal(false)
        setNewFlow({ name: '', description: '', role_type: 'general', estimated_days: 30 })
      }
    } catch (error) {
      console.error('Error creating flow:', error)
    }
  }

  const createFromTemplate = async (templateId: string, name: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/flows/from-template/${templateId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
      })
      const data = await response.json()
      if (data.success) {
        fetchFlows()
        setShowTemplateModal(false)
      }
    } catch (error) {
      console.error('Error creating from template:', error)
    }
  }

  const startFlow = async (flowId: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/flows/${flowId}/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        fetchFlowDetails(flowId)
      }
    } catch (error) {
      console.error('Error starting flow:', error)
    }
  }

  const completeStep = async (stepId: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/flows/steps/${stepId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ score: 100 })
      })
      const data = await response.json()
      if (data.success && selectedFlow) {
        fetchFlowDetails(selectedFlow.id)
      }
    } catch (error) {
      console.error('Error completing step:', error)
    }
  }

  const getStepStatus = (stepId: string): StepProgress | null => {
    if (!userProgress?.steps) return null
    return userProgress.steps.find(s => s.step_id === stepId) || null
  }

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
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            Flujos de Onboarding
          </h1>
          <p className="text-surface-400 mt-1">Gestiona los procesos de incorporación por rol</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowTemplateModal(true)} className="btn-secondary">
            <Layers className="w-4 h-4 mr-2" />
            Desde Template
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Flujo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {[
          { key: 'flows', label: 'Flujos', icon: GitBranch },
          { key: 'templates', label: 'Templates', icon: Layers },
          { key: 'metrics', label: 'Métricas', icon: BarChart3 }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-violet-500/10 text-teal-500'
                : 'text-surface-400 hover:text-white hover:bg-white/5'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Metrics Cards */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-surface-400 text-sm">Flujos Activos</p>
                <p className="text-2xl font-bold text-white">{metrics.total_flows}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-teal-500" />
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-surface-400 text-sm">En Progreso</p>
                <p className="text-2xl font-bold text-amber-400">{metrics.in_progress}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-surface-400 text-sm">Completados</p>
                <p className="text-2xl font-bold text-emerald-400">{metrics.completed}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-surface-400 text-sm">Aprobaciones Pendientes</p>
                <p className="text-2xl font-bold text-rose-400">{metrics.pending_approvals}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-rose-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Flow List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Flujos</h2>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="input-field py-1 px-3 text-sm"
            >
              <option value="">Todos los roles</option>
              <option value="ejecutivo">Ejecutivo</option>
              <option value="tecnico">Técnico</option>
              <option value="comercial">Comercial</option>
              <option value="general">General</option>
            </select>
          </div>

          <div className="space-y-3">
            {flows.map((flow) => {
              const colors = roleColors[flow.role_type]
              return (
                <div
                  key={flow.id}
                  onClick={() => fetchFlowDetails(flow.id)}
                  className={cn(
                    'card p-4 cursor-pointer transition-all hover:border-violet-500/30',
                    selectedFlow?.id === flow.id && 'border-teal-400/50 bg-violet-500/5'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', colors.bg, colors.text)}>
                          {roleLabels[flow.role_type]}
                        </span>
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-xs',
                          flow.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-400'
                        )}>
                          {flow.status}
                        </span>
                      </div>
                      <h3 className="font-medium text-white">{flow.name}</h3>
                      <p className="text-sm text-surface-400 mt-1 line-clamp-2">{flow.description}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-surface-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {flow.estimated_days} días
                        </span>
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          {flow.steps?.length || 0} pasos
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-surface-500" />
                  </div>
                </div>
              )
            })}

            {flows.length === 0 && (
              <div className="card p-8 text-center">
                <GitBranch className="w-12 h-12 text-surface-600 mx-auto mb-3" />
                <p className="text-surface-400">No hay flujos creados</p>
                <button onClick={() => setShowCreateModal(true)} className="btn-primary mt-4">
                  Crear primer flujo
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Flow Details */}
        <div className="lg:col-span-2">
          {selectedFlow ? (
            <div className="space-y-6">
              {/* Flow Header */}
              <div className="card p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={cn(
                        'px-3 py-1 rounded-full text-sm font-medium',
                        roleColors[selectedFlow.role_type].bg,
                        roleColors[selectedFlow.role_type].text
                      )}>
                        {roleLabels[selectedFlow.role_type]}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-white">{selectedFlow.name}</h2>
                    <p className="text-surface-400 mt-1">{selectedFlow.description}</p>
                  </div>
                  {!userProgress && (
                    <button onClick={() => startFlow(selectedFlow.id)} className="btn-primary">
                      <Play className="w-4 h-4 mr-2" />
                      Iniciar Flujo
                    </button>
                  )}
                </div>

                {/* Progress Bar */}
                {userProgress && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-surface-400">Progreso</span>
                      <span className="text-sm font-medium text-white">{userProgress.progress_percentage.toFixed(0)}%</span>
                    </div>
                    <div className="h-3 bg-surface-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${userProgress.progress_percentage}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-surface-500">
                      <span>Iniciado: {new Date(userProgress.started_at).toLocaleDateString()}</span>
                      {userProgress.completed_at && (
                        <span>Completado: {new Date(userProgress.completed_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Steps */}
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Pasos del Flujo</h3>
                <div className="space-y-3">
                  {selectedFlow.steps?.map((step, index) => {
                    const StepIcon = stepTypeIcons[step.step_type]
                    const stepProgress = getStepStatus(step.id)
                    const isCompleted = stepProgress?.status === 'completed'
                    const isCurrent = userProgress?.current_step_id === step.id
                    const isBlocked = stepProgress?.status === 'blocked'

                    return (
                      <div
                        key={step.id}
                        className={cn(
                          'flex items-center gap-4 p-4 rounded-xl border transition-all',
                          isCompleted && 'border-emerald-500/30 bg-emerald-500/5',
                          isCurrent && 'border-violet-500/30 bg-violet-500/5',
                          isBlocked && 'border-rose-500/30 bg-rose-500/5',
                          !isCompleted && !isCurrent && !isBlocked && 'border-white/5 bg-surface-900'
                        )}
                      >
                        {/* Step Number/Status */}
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                          isCompleted ? 'bg-emerald-500' : isCurrent ? 'bg-violet-500' : 'bg-surface-700'
                        )}>
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-white" />
                          ) : (
                            <span className="text-white font-medium">{index + 1}</span>
                          )}
                        </div>

                        {/* Step Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className={cn('font-medium', isCompleted ? 'text-emerald-400' : 'text-white')}>
                              {step.name}
                            </h4>
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-800 text-xs text-surface-400">
                              <StepIcon className="w-3 h-3" />
                              {stepTypeLabels[step.step_type]}
                            </span>
                            {step.is_required && (
                              <span className="text-xs text-amber-400">Requerido</span>
                            )}
                          </div>
                          {step.description && (
                            <p className="text-sm text-surface-400 mt-1">{step.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-surface-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {step.estimated_hours}h estimadas
                            </span>
                          </div>
                        </div>

                        {/* Action */}
                        {userProgress && !isCompleted && isCurrent && (
                          <button
                            onClick={() => completeStep(step.id)}
                            className="btn-primary py-2"
                          >
                            Completar
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Checklists */}
              {selectedFlow.checklists && selectedFlow.checklists.length > 0 && (
                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Checklists</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedFlow.checklists.map((checklist) => (
                      <ChecklistCard key={checklist.id} checklist={checklist} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <GitBranch className="w-16 h-16 text-surface-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Selecciona un flujo</h3>
              <p className="text-surface-400">Haz clic en un flujo para ver sus detalles y pasos</p>
            </div>
          )}
        </div>
      </div>

      {/* Templates Tab Content */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {templates.map((template) => {
            const colors = roleColors[template.role_type as keyof typeof roleColors]
            return (
              <div key={template.id} className="card p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', colors.bg, colors.text)}>
                    {roleLabels[template.role_type as keyof typeof roleLabels]}
                  </span>
                </div>
                <h3 className="font-semibold text-white mb-2">{template.name}</h3>
                <p className="text-sm text-surface-400 mb-4">{template.description}</p>
                {template.template_data?.steps && (
                  <p className="text-xs text-surface-500 mb-4">
                    {template.template_data.steps.length} pasos • {template.template_data.checklists?.length || 0} checklists
                  </p>
                )}
                <button
                  onClick={() => {
                    const name = prompt('Nombre del nuevo flujo:', template.name)
                    if (name) createFromTemplate(template.id, name)
                  }}
                  className="btn-secondary w-full"
                >
                  Usar Template
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Nuevo Flujo de Onboarding</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-surface-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-surface-400 mb-1">Nombre del flujo</label>
                <input
                  type="text"
                  value={newFlow.name}
                  onChange={(e) => setNewFlow({ ...newFlow, name: e.target.value })}
                  className="input-field w-full"
                  placeholder="Ej: Onboarding Desarrollo Q1 2026"
                />
              </div>
              <div>
                <label className="block text-sm text-surface-400 mb-1">Descripción</label>
                <textarea
                  value={newFlow.description}
                  onChange={(e) => setNewFlow({ ...newFlow, description: e.target.value })}
                  className="input-field w-full h-24 resize-none"
                  placeholder="Describe el objetivo del flujo..."
                />
              </div>
              <div>
                <label className="block text-sm text-surface-400 mb-1">Tipo de Rol</label>
                <select
                  value={newFlow.role_type}
                  onChange={(e) => setNewFlow({ ...newFlow, role_type: e.target.value as any })}
                  className="input-field w-full"
                >
                  <option value="ejecutivo">Ejecutivo</option>
                  <option value="tecnico">Técnico</option>
                  <option value="comercial">Comercial</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-surface-400 mb-1">Días estimados</label>
                <input
                  type="number"
                  value={newFlow.estimated_days}
                  onChange={(e) => setNewFlow({ ...newFlow, estimated_days: parseInt(e.target.value) })}
                  className="input-field w-full"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button onClick={createFlow} className="btn-primary flex-1">
                Crear Flujo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Seleccionar Template</h2>
              <button onClick={() => setShowTemplateModal(false)} className="text-surface-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {templates.map((template) => {
                const colors = roleColors[template.role_type as keyof typeof roleColors]
                return (
                  <div key={template.id} className="border border-white/10 rounded-xl p-4 hover:border-violet-500/30">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', colors.bg, colors.text)}>
                        {roleLabels[template.role_type as keyof typeof roleLabels]}
                      </span>
                    </div>
                    <h3 className="font-semibold text-white mb-2">{template.name}</h3>
                    <p className="text-sm text-surface-400 mb-3">{template.description}</p>
                    {template.template_data?.steps && (
                      <div className="text-xs text-surface-500 mb-4">
                        <p className="font-medium text-surface-400 mb-1">Pasos incluidos:</p>
                        <ul className="list-disc list-inside">
                          {template.template_data.steps.slice(0, 4).map((step: any, i: number) => (
                            <li key={i}>{step.name}</li>
                          ))}
                          {template.template_data.steps.length > 4 && (
                            <li>...y {template.template_data.steps.length - 4} más</li>
                          )}
                        </ul>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        const name = prompt('Nombre del nuevo flujo:', template.name)
                        if (name) createFromTemplate(template.id, name)
                      }}
                      className="btn-primary w-full"
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Crear desde este Template
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Checklist Card Component
function ChecklistCard({ checklist }: { checklist: Checklist }) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [, setLoading] = useState(true)

  useEffect(() => {
    fetchChecklistItems()
  }, [checklist.id])

  const fetchChecklistItems = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/flows/checklists/${checklist.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.success) {
        setItems(data.data.items || [])
      }
    } catch (error) {
      console.error('Error fetching checklist items:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = async (itemId: string, isCompleted: boolean) => {
    if (isCompleted) return // Ya completado
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`${API_URL}/flows/checklists/items/${itemId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: '' })
      })
      fetchChecklistItems()
    } catch (error) {
      console.error('Error completing item:', error)
    }
  }

  const completedCount = items.filter(i => i.is_completed).length
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0

  return (
    <div className="border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-white">{checklist.name}</h4>
        <span className={cn(
          'px-2 py-0.5 rounded-full text-xs',
          checklist.checklist_type === 'automated' ? 'bg-blue-500/10 text-blue-400' : 'bg-surface-700 text-surface-400'
        )}>
          {checklist.checklist_type}
        </span>
      </div>
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-surface-400 mb-1">
          <span>{completedCount}/{items.length} completados</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => toggleItem(item.id, item.is_completed)}
            className={cn(
              'flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors',
              item.is_completed ? 'bg-emerald-500/10' : 'bg-surface-800 hover:bg-surface-700'
            )}
          >
            <div className={cn(
              'w-5 h-5 rounded border flex items-center justify-center shrink-0',
              item.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-surface-600'
            )}>
              {item.is_completed && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            <span className={cn(
              'text-sm',
              item.is_completed ? 'text-emerald-400 line-through' : 'text-surface-300'
            )}>
              {item.item_text}
            </span>
            {item.is_required && !item.is_completed && (
              <span className="text-xs text-amber-400 ml-auto">Requerido</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
