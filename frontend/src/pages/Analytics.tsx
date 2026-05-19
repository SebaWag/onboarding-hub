import { useState, useEffect } from 'react'
import { BarChart3, Users, Eye, Clock, MessageSquare, ArrowUpRight, ArrowDownRight, Sparkles, Download, Loader2, PlayCircle } from 'lucide-react'
import { cn } from '../lib/utils'

const API_URL = import.meta.env.VITE_API_URL || '/api'

interface OverviewStats { total_users: number; active_users: number; active_programs: number; total_videos: number; total_views: number; flows_in_progress: number; flows_completed: number }
interface VideoMetric { id: string; title: string; thumbnail_url?: string; duration_seconds: number; view_count?: number; content_title?: string; module_title?: string; created_at?: string }
interface WeeklyData { day: string; views: number; questions: number }
interface Insight { type: 'violet' | 'emerald' | 'amber' | 'rose'; text: string }

export default function Analytics() {
  const [selectedPeriod, setSelectedPeriod] = useState('week')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [topVideos, setTopVideos] = useState<VideoMetric[]>([])
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([])
  const [insights, setInsights] = useState<Insight[]>([])

  useEffect(() => { fetchAnalyticsData() }, [selectedPeriod])

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true); setError(null)
      const token = localStorage.getItem('auth_token')
      if (!token) { setError('No autenticado'); return }
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      const [overviewRes, videosRes, weeklyRes] = await Promise.all([
        fetch(`${API_URL}/analytics/overview`, { headers }),
        fetch(`${API_URL}/analytics/videos`, { headers }),
        fetch(`${API_URL}/analytics/weekly`, { headers })
      ])
      if (!overviewRes.ok || !videosRes.ok || !weeklyRes.ok) throw new Error('Error cargando datos')
      const overviewData = await overviewRes.json()
      const videosData = await videosRes.json()
      const weeklyJson = await weeklyRes.json()
      setOverview(overviewData.success ? overviewData.data : null)
      setTopVideos(videosData.success ? (videosData.data.top_videos || []) : [])
      setWeeklyData(weeklyJson.success ? weeklyJson.data : [])
      generateInsights(overviewData.data, videosData.data, weeklyJson.data)
    } catch (err: any) { console.error('Analytics fetch error:', err); setError(err.message) }
    finally { setLoading(false) }
  }

  const generateInsights = (overviewData: OverviewStats | null, videosData: any, weeklyData: WeeklyData[]) => {
    const newInsights: Insight[] = []
    if (videosData?.top_videos?.length > 0) newInsights.push({ type: 'violet', text: `${videosData.top_videos[0].title || 'Tu video'} es tu tutorial más visto.` })
    if (overviewData && overviewData.active_programs > 0) newInsights.push({ type: 'emerald', text: `Tienes ${overviewData.active_programs} programas activos con ${overviewData.total_videos} videos.` })
    if (weeklyData && weeklyData.length > 0) { const total = weeklyData.reduce((sum, d) => sum + (d.views || 0), 0); if (total > 0) newInsights.push({ type: 'amber', text: `Esta semana se han visto ${total} videos.` }) }
    if (overviewData && overviewData.total_users > overviewData.active_users) newInsights.push({ type: 'rose', text: `${overviewData.total_users - overviewData.active_users} usuarios no han iniciado sesión.` })
    if (newInsights.length === 0) { newInsights.push({ type: 'violet', text: 'Comienza a subir videos para ver métricas.' }, { type: 'emerald', text: 'Los videos cortos tienen mayor tasa de completado.' }) }
    setInsights(newInsights)
  }

  const formatDuration = (seconds: number): string => seconds ? `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}` : '0:00'
  const maxViews = Math.max(...weeklyData.map(d => d.views || 0), 1)

  const stats = [
    { name: 'Total Visualizaciones', value: overview?.total_views ?? 0, change: '+23.5%', trend: 'up' as const, icon: Eye, color: 'violet' },
    { name: 'Usuarios Activos', value: overview?.active_users ?? 0, change: '+12.3%', trend: 'up' as const, icon: Users, color: 'emerald' },
    { name: 'Videos Totales', value: overview?.total_videos ?? 0, change: '+8', trend: 'up' as const, icon: PlayCircle, color: 'amber' },
    { name: 'Flujos Completados', value: overview?.flows_completed ?? 0, change: '+45.8%', trend: 'up' as const, icon: MessageSquare, color: 'rose' },
  ]

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>
  if (error) return <div className="flex items-center justify-center min-h-[400px]"><div className="text-center"><p className="text-rose-500 mb-2">Error: {error}</p><button onClick={fetchAnalyticsData} className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)]">Reintentar</button></div></div>

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            Analytics
          </h1>
          <p className="text-[var(--text-muted)] mt-1">Métricas y estadísticas de tus tutoriales</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
            {['day', 'week', 'month'].map((period) => (
              <button key={period} onClick={() => setSelectedPeriod(period)} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize', selectedPeriod === period ? 'bg-teal-50 text-teal-600 dark:text-teal-500' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
                {period === 'day' ? 'Hoy' : period === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm hover:bg-[var(--bg-hover)]">
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border-color)] shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className={cn('p-2.5 rounded-xl', stat.color === 'violet' && 'bg-teal-50 dark:bg-teal-50 text-teal-600 dark:text-teal-500', stat.color === 'emerald' && 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400', stat.color === 'amber' && 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400', stat.color === 'rose' && 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400')}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className={cn('flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full', stat.trend === 'up' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400')}>
                {stat.trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{stat.change}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">{stat.name}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Activity Chart + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Actividad Semanal</h2>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-violet-500" /><span className="text-[var(--text-muted)]">Visualizaciones</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-[var(--text-muted)]">Preguntas</span></div>
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 h-48">
            {weeklyData.length > 0 ? weeklyData.map((day, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex gap-1 items-end h-40">
                  <div className="flex-1 bg-gradient-to-t from-violet-500 to-violet-400 rounded-t-md transition-all hover:opacity-80" style={{ height: `${((day.views || 0) / maxViews) * 100}%` }} />
                  <div className="flex-1 bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t-md transition-all hover:opacity-80" style={{ height: `${((day.questions || 0) / 100) * 100}%` }} />
                </div>
                <span className="text-xs text-[var(--text-muted)]">{day.day}</span>
              </div>
            )) : (
              <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">Sin datos</div>
            )}
          </div>
        </div>

        {/* Insights Card */}
        <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-teal-200 dark:border-violet-500/20 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-violet-500" />
            <h3 className="font-semibold text-[var(--text-primary)]">Insights de MiMo</h3>
          </div>
          <ul className="space-y-3">
            {insights.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <span className={cn('font-bold', insight.type === 'violet' && 'text-violet-500', insight.type === 'emerald' && 'text-emerald-500', insight.type === 'amber' && 'text-amber-500', insight.type === 'rose' && 'text-rose-500')}>•</span>
                {insight.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Top Videos Table */}
      <div className="bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-[var(--border-color)] shadow-sm">
        <div className="p-6 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Top Tutoriales</h2>
        </div>
        {topVideos.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-6 py-4">Tutorial</th>
                <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-6 py-4">Duración</th>
                <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-6 py-4">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {topVideos.map((video) => (
                <tr key={video.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-6 py-4"><p className="font-medium text-[var(--text-primary)]">{video.title || 'Sin título'}</p></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-[var(--text-muted)]" /><span className="text-[var(--text-secondary)]">{formatDuration(video.duration_seconds || 0)}</span></div>
                  </td>
                  <td className="px-6 py-4"><span className="text-sm text-[var(--text-muted)]">{video.created_at ? new Date(video.created_at).toLocaleDateString('es-ES') : '-'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-[var(--text-muted)]">
            <PlayCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No hay videos disponibles</p>
            <p className="text-sm mt-1">Sube videos a tus módulos para ver métricas</p>
          </div>
        )}
      </div>
    </div>
  )
}
