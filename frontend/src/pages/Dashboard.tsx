import { useState, useEffect } from 'react'
import {
  Users,
  BookOpen,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Video,
  PlayCircle,
  TrendingUp,
  Loader2
} from 'lucide-react'
import { cn } from '../lib/utils'

const API_URL = import.meta.env.VITE_API_URL || '/api'

interface DashboardStats {
  total_users: number
  active_users: number
  active_programs: number
  total_videos: number
  total_views: number
  flows_in_progress: number
  flows_completed: number
}

interface User {
  id: string
  name: string
  email: string
  avatar_url?: string
  department?: string
}

interface WeeklyData {
  day: string
  views: number
  questions: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('No autenticado')
        return
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }

      const [overviewRes, weeklyRes, userRes] = await Promise.all([
        fetch(`${API_URL}/analytics/overview`, { headers }),
        fetch(`${API_URL}/analytics/weekly`, { headers }),
        fetch(`${API_URL}/auth/me`, { headers })
      ])

      if (!overviewRes.ok) throw new Error('Error cargando estadísticas')
      if (!weeklyRes.ok) throw new Error('Error cargando datos semanales')
      if (!userRes.ok) throw new Error('Error cargando usuario')

      const overviewData = await overviewRes.json()
      const weeklyJson = await weeklyRes.json()
      const userJson = await userRes.json()

      setStats(overviewData.success ? overviewData.data : null)
      setWeeklyData(Array.isArray(weeklyJson.data) ? weeklyJson.data : [])
      setCurrentUser(userJson.success ? userJson.data : null)

    } catch (err: any) {
      console.error('Dashboard fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-rose-500 mb-2">Error: {error}</p>
          <button onClick={fetchDashboardData} className="px-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm hover:bg-[var(--bg-hover)] transition-colors">
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const statsData = [
    { name: 'Usuarios Activos', value: stats?.active_users?.toLocaleString() || '0', change: '+12.5%', trend: 'up' as const, icon: Users, color: 'violet' },
    { name: 'Programas Activos', value: stats?.active_programs?.toString() || '0', change: '+3', trend: 'up' as const, icon: BookOpen, color: 'emerald' },
    { name: 'Videos Totales', value: stats?.total_videos?.toString() || '0', change: '+8', trend: 'up' as const, icon: Video, color: 'amber' },
    { name: 'Flujos Completados', value: stats?.flows_completed?.toString() || '0', change: stats?.flows_in_progress ? `+${stats.flows_in_progress}` : '+0', trend: 'up' as const, icon: CheckCircle2, color: 'rose' },
  ]

  const maxViews = Math.max(...weeklyData.map(d => d.views || 0), 1)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h1>
          <p className="text-[var(--text-muted)] mt-1">
            Bienvenido de vuelta, {currentUser?.name || 'Usuario'}
          </p>
        </div>
        <div className="text-sm text-[var(--text-muted)]">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsData.map((stat) => (
          <div key={stat.name} className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border-color)] shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className={cn('p-2.5 rounded-xl', 
                stat.color === 'violet' && 'bg-teal-50 dark:bg-teal-50 text-teal-600 dark:text-teal-500',
                stat.color === 'emerald' && 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
                stat.color === 'amber' && 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',
                stat.color === 'rose' && 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400')}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className={cn('flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
                stat.trend === 'up' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400')}>
                {stat.trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {stat.change}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">{stat.name}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Activity Chart + AI Assistant */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Activity */}
        <div className="lg:col-span-2 bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-violet-500" />
              Actividad Semanal
            </h2>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-violet-500" />
                <span className="text-[var(--text-muted)]">Visualizaciones</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-[var(--text-muted)]">Preguntas</span>
              </div>
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 h-40">
            {weeklyData.length > 0 ? weeklyData.map((day, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex gap-1 items-end h-36">
                  <div 
                    className="flex-1 bg-gradient-to-t from-violet-500 to-violet-400 rounded-t-md transition-all hover:opacity-80" 
                    style={{ height: `${((day.views || 0) / maxViews) * 100}%` }} 
                    title={`${day.views || 0} visualizaciones`}
                  />
                  <div 
                    className="flex-1 bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t-md transition-all hover:opacity-80" 
                    style={{ height: `${((day.questions || 0) / 100) * 100}%` }} 
                    title={`${day.questions || 0} preguntas`}
                  />
                </div>
                <span className="text-xs text-[var(--text-muted)]">{day.day}</span>
              </div>
            )) : (
              <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
                No hay datos de actividad
              </div>
            )}
          </div>
        </div>

        {/* AI Assistant Card */}
        <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-violet-500/20 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">Asistente IA - MiMo</h3>
              <p className="text-xs text-[var(--text-muted)]">Xiaomi AI</p>
            </div>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            ¿Necesitas ayuda con tu onboarding? Pregúntale a MiMo sobre tus programas, videos o flujos de capacitación.
          </p>
          <button 
            onClick={() => window.location.href = '/chat'}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-medium shadow-md hover:shadow-lg transition-shadow flex items-center justify-center gap-2"
          >
            <PlayCircle className="w-4 h-4" />
            Iniciar Chat con IA
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-50">
              <PlayCircle className="w-5 h-5 text-teal-600 dark:text-teal-500" />
            </div>
            <span className="text-[var(--text-muted)] text-sm">Total Visualizaciones</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-primary)]">{stats?.total_views?.toLocaleString() || '0'}</p>
        </div>
        <div className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
              <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[var(--text-muted)] text-sm">Tasa de Engagement</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-primary)]">
            {stats && stats.total_users > 0 
              ? ((stats.active_users / stats.total_users) * 100).toFixed(1)
              : '0'}%
          </p>
        </div>
        <div className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-500/20">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-[var(--text-muted)] text-sm">Flujos en Progreso</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-primary)]">{stats?.flows_in_progress || 0}</p>
        </div>
      </div>
    </div>
  )
}
