import { useState, useEffect } from 'react'
import { Users as UsersIcon, Search, Mail, UserPlus, X, Video, MessageSquare, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

const API_URL = import.meta.env.VITE_API_URL || '/api'

interface User { id: string; name: string; email: string; role: string; department?: string; position?: string; avatar_url?: string; hire_date?: string; last_login?: string; is_active: boolean; org_role: string; videos: number; questions: number; last_active: string; org_name?: string }
interface UserStats { total: number; active: number; admins: number; editors: number; by_department: Array<{ department: string; count: number }> }
interface InviteFormData { email: string; name: string; department: string; position: string; org_role: string }

export default function Users() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<UserStats | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteFormData>({ email: '', name: '', department: '', position: '', org_role: 'viewer' })

  useEffect(() => { fetchUsers(); fetchStats() }, [selectedRole, statusFilter])

  const fetchUsers = async () => {
    try {
      setLoading(true); setError(null)
      const token = localStorage.getItem('auth_token')
      if (!token) { setError('No autenticado'); return }
      const params = new URLSearchParams()
      if (searchQuery) params.append('search', searchQuery)
      if (selectedRole !== 'all') params.append('role', selectedRole)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      const response = await fetch(`${API_URL}/users?${params}`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!response.ok) throw new Error('Error cargando usuarios')
      const data = await response.json()
      setUsers(data.success ? data.data : [])
    } catch (err: any) { console.error('Fetch users error:', err); setError(err.message) }
    finally { setLoading(false) }
  }

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/users/stats/summary`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (response.ok) { const data = await response.json(); setStats(data.success ? data.data : null) }
    } catch (err) { console.error('Stats error:', err) }
  }

  const handleInvite = async () => {
    if (!inviteForm.email || !inviteForm.name) { alert('Email y nombre son requeridos'); return }
    try {
      setSaving(true)
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_URL}/users/invite`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(inviteForm) })
      if (response.ok) { alert('Invitación enviada'); setShowInviteModal(false); setInviteForm({ email: '', name: '', department: '', position: '', org_role: 'viewer' }) }
      else { const err = await response.json(); alert(err.error || 'Error al invitar') }
    } catch (err) { console.error('Invite error:', err) }
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>
  if (error) return <div className="flex items-center justify-center min-h-[400px]"><div className="text-center"><p className="text-rose-500 mb-2">Error: {error}</p><button onClick={fetchUsers} className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)]">Reintentar</button></div></div>

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
              <UsersIcon className="w-5 h-5 text-white" />
            </div>
            Usuarios
          </h1>
          <p className="text-[var(--text-muted)] mt-1">Gestiona los usuarios de tu organización</p>
        </div>
        <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md hover:shadow-lg">
          <UserPlus className="w-4 h-4" /> Invitar Usuario
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-color)] shadow-sm">
            <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.total}</p>
            <p className="text-sm text-[var(--text-muted)]">Total Usuarios</p>
          </div>
          <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-color)] shadow-sm">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
            <p className="text-sm text-[var(--text-muted)]">Activos</p>
          </div>
          <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-color)] shadow-sm">
            <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.admins}</p>
            <p className="text-sm text-[var(--text-muted)]">Administradores</p>
          </div>
          <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-color)] shadow-sm">
            <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.editors}</p>
            <p className="text-sm text-[var(--text-muted)]">Editores</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input type="text" placeholder="Buscar usuarios..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" />
        </div>
        <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-teal-500">
          <option value="all">Todos los roles</option>
          <option value="admin">Administrador</option>
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-teal-500">
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((user) => (
          <div key={user.id} className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border-color)] hover:shadow-lg transition-shadow">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white font-semibold text-lg shrink-0">
                {user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[var(--text-primary)] truncate">{user.name}</h3>
                <p className="text-sm text-[var(--text-muted)] truncate">{user.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', user.org_role === 'admin' ? 'bg-teal-50 dark:bg-teal-50 text-teal-600 dark:text-teal-500' : user.org_role === 'editor' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-500/20 text-gray-600 dark:text-gray-400')}>
                    {user.org_role}
                  </span>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', user.is_active ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-500/20 text-gray-600 dark:text-gray-400')}>
                    {user.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--border-color)] text-sm text-[var(--text-muted)]">
              <span className="flex items-center gap-1"><Video className="w-4 h-4" /> {user.videos || 0}</span>
              <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" /> {user.questions || 0}</span>
              {user.department && <span className="ml-auto">{user.department}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md border border-[var(--border-color)] shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Invitar Usuario</h2>
              <button onClick={() => setShowInviteModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Email *</label>
                <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({...inviteForm, email: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" placeholder="email@ejemplo.com" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Nombre *</label>
                <input type="text" value={inviteForm.name} onChange={(e) => setInviteForm({...inviteForm, name: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" placeholder="Nombre completo" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Departamento</label>
                <input type="text" value={inviteForm.department} onChange={(e) => setInviteForm({...inviteForm, department: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500" placeholder="Ej: Ventas" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-2">Rol</label>
                <select value={inviteForm.org_role} onChange={(e) => setInviteForm({...inviteForm, org_role: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500">
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowInviteModal(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-hover)]">Cancelar</button>
                <button onClick={handleInvite} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><Mail className="w-4 h-4 inline mr-2" />Enviar Invitación</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
