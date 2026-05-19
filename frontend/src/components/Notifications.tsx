import { useState } from 'react'
import { Bell, X, Eye, MessageSquare, ThumbsUp, Share2, UserPlus, Video, Sparkles, CheckCheck } from 'lucide-react'
import { cn } from '../lib/utils'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  timestamp: Date
  read: boolean
}

const mockNotifications: Notification[] = [
  { id: '1', type: 'view', title: 'Nuevo video visto', message: 'Maria Gonzalez vio tu tutorial VPN', timestamp: new Date(Date.now() - 5 * 60 * 1000), read: false },
  { id: '2', type: 'question', title: 'Nueva pregunta', message: 'Carlos Ruiz pregunto sobre reset de contrasena', timestamp: new Date(Date.now() - 15 * 60 * 1000), read: false },
  { id: '3', type: 'ai_insight', title: 'Insight de MiMo', message: 'Tu tutorial de SAP tiene 30% mas engagement', timestamp: new Date(Date.now() - 30 * 60 * 1000), read: false },
  { id: '4', type: 'video_ready', title: 'Video procesado', message: 'Tu grabacion esta lista', timestamp: new Date(Date.now() - 60 * 60 * 1000), read: true },
]

interface NotificationsProps {
  isOpen: boolean
  onClose: () => void
}

export function NotificationsPanel({ isOpen, onClose }: NotificationsProps) {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const unreadCount = notifications.filter(n => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'view': return <Eye className="w-4 h-4" />
      case 'question': return <MessageSquare className="w-4 h-4" />
      case 'like': return <ThumbsUp className="w-4 h-4" />
      case 'share': return <Share2 className="w-4 h-4" />
      case 'new_user': return <UserPlus className="w-4 h-4" />
      case 'video_ready': return <Video className="w-4 h-4" />
      case 'ai_insight': return <Sparkles className="w-4 h-4" />
      default: return <Bell className="w-4 h-4" />
    }
  }

  const getIconColor = (type: string) => {
    switch (type) {
      case 'view': return 'bg-violet-500/10 text-violet-400'
      case 'question': return 'bg-emerald-500/10 text-emerald-400'
      case 'video_ready': return 'bg-emerald-500/10 text-emerald-400'
      case 'ai_insight': return 'bg-violet-500/10 text-violet-400'
      default: return 'bg-surface-700 text-surface-400'
    }
  }

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    if (minutes < 1) return 'Ahora'
    if (minutes < 60) return `Hace ${minutes} min`
    return `Hace ${hours}h`
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-4 top-16 w-96 max-h-[calc(100vh-5rem)] glass rounded-2xl overflow-hidden shadow-2xl z-50 animate-slide-down">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-violet-400" />
            <h3 className="font-semibold text-white">Notificaciones</h3>
            {unreadCount > 0 && <span className="badge badge-violet">{unreadCount} nuevas</span>}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors" title="Marcar todas como leidas">
                <CheckCheck className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-12 h-12 text-surface-600 mx-auto mb-3" />
              <p className="text-surface-400">No hay notificaciones</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {notifications.map((notification) => (
                <div key={notification.id} onClick={() => markAsRead(notification.id)} className={cn('p-4 hover:bg-white/[0.02] transition-colors cursor-pointer', !notification.read && 'bg-violet-500/[0.03]')}>
                  <div className="flex items-start gap-3">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', getIconColor(notification.type))}>
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-sm', notification.read ? 'text-surface-300' : 'text-white font-medium')}>
                          {notification.title}
                        </p>
                        {!notification.read && <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0 mt-1.5" />}
                      </div>
                      <p className="text-sm text-surface-500 mt-0.5 line-clamp-2">{notification.message}</p>
                      <p className="text-xs text-surface-600 mt-1">{formatTime(notification.timestamp)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-white/5">
          <button className="w-full py-2 text-sm text-violet-400 hover:text-violet-300 transition-colors">
            Ver todas las notificaciones
          </button>
        </div>
      </div>
    </>
  )
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const unreadCount = mockNotifications.filter(n => !n.read).length

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="relative p-2 rounded-xl text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />}
      </button>
      <NotificationsPanel isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  )
}

export default NotificationsPanel
