import { useState } from 'react'
import { Settings as SettingsIcon, User, Bell, Shield, Video, Save, Check, Sparkles, Building2, Lock } from 'lucide-react'
import { cn } from '../lib/utils'
import Switch from '../components/Switch'

const sections = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'organization', label: 'Organización', icon: Building2 },
  { id: 'recording', label: 'Grabación', icon: Video },
  { id: 'ai', label: 'IA y MiMo', icon: Sparkles },
  { id: 'notifications', label: 'Notificaciones', icon: Bell },
  { id: 'security', label: 'Seguridad', icon: Shield },
]

export default function Settings() {
  const [activeSection, setActiveSection] = useState('profile')
  const [saved, setSaved] = useState(false)
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    autoTranscribe: true,
    smartChapters: true,
    'Nuevos comentarios': true,
    'Asignación de tareas': true,
    'Recordatorios de vencimiento': true,
    'Nuevos videos en programas': true,
  })
  const togglePref = (key: string) => setPrefs(prev => ({ ...prev, [key]: !(prev[key] ?? true) }))

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-white" />
            </div>
            Configuración
          </h1>
          <p className="text-[var(--text-muted)] mt-1">Administra las preferencias de tu cuenta</p>
        </div>
        <button onClick={handleSave} className={cn('flex items-center gap-2 px-4 py-2 rounded-xl font-medium shadow-md transition-all', saved ? 'bg-emerald-500 text-white' : 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:shadow-lg')}>
          {saved ? <><Check className="w-4 h-4" /> Guardado</> : <><Save className="w-4 h-4" /> Guardar Cambios</>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Nav */}
        <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border-color)] h-fit">
          <nav className="space-y-1">
            {sections.map((section) => (
              <button key={section.id} onClick={() => setActiveSection(section.id)} className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all font-medium', activeSection === section.id ? 'bg-[var(--accent-bg)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]')}>
                <section.icon className="w-5 h-5" />
                {section.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="lg:col-span-3 bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border-color)]">
          {activeSection === 'profile' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Perfil de Usuario</h2>
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white text-2xl font-bold">SW</div>
                <button className="px-4 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm hover:bg-[var(--bg-hover)]">Cambiar Avatar</button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Nombre</label>
                  <input type="text" defaultValue="Sebastian Wagner" className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Email</label>
                  <input type="email" defaultValue="sebastian@konektor.com" className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--input-border)] text-[var(--text-muted)]" disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Departamento</label>
                  <input type="text" defaultValue="Tecnología" className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Cargo</label>
                  <input type="text" defaultValue="Key Account Manager" className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500" />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'organization' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Organización</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Nombre de la empresa</label>
                  <input type="text" defaultValue="Konektor Group" className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Slug</label>
                  <input type="text" defaultValue="konektor" className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--input-border)] text-[var(--text-muted)]" disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Plan</label>
                  <input type="text" value="Enterprise" className="w-full px-4 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-600 dark:text-teal-500" disabled />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'ai' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Configuración de MiMo</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">Transcripción automática</p>
                    <p className="text-sm text-[var(--text-muted)]">Generar transcripción al subir videos</p>
                  </div>
                  <Switch ariaLabel="Transcripción automática" checked={prefs.autoTranscribe} onChange={() => togglePref('autoTranscribe')} />
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">Capítulos inteligentes</p>
                    <p className="text-sm text-[var(--text-muted)]">Detectar automáticamente cambios de tema</p>
                  </div>
                  <Switch ariaLabel="Capítulos inteligentes" checked={prefs.smartChapters} onChange={() => togglePref('smartChapters')} />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-3">
                <Lock className="w-5 h-5 text-teal-500" />
                Seguridad
              </h2>
              <div className="space-y-4">
                <button className="w-full flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                  <div className="text-left">
                    <p className="font-medium text-[var(--text-primary)]">Cambiar contraseña</p>
                    <p className="text-sm text-[var(--text-muted)]">Último cambio: hace 30 días</p>
                  </div>
                  <span className="text-[var(--text-muted)]">→</span>
                </button>
                <button className="w-full flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
                  <div className="text-left">
                    <p className="font-medium text-[var(--text-primary)]">Autenticación de dos factores</p>
                    <p className="text-sm text-emerald-500">Activado</p>
                  </div>
                  <span className="text-[var(--text-muted)]">→</span>
                </button>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Notificaciones</h2>
              <div className="space-y-4">
                {['Nuevos comentarios', 'Asignación de tareas', 'Recordatorios de vencimiento', 'Nuevos videos en programas'].map((item) => (
                  <div key={item} className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                    <p className="font-medium text-[var(--text-primary)]">{item}</p>
                    <Switch ariaLabel={item} checked={prefs[item] ?? true} onChange={() => togglePref(item)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'recording' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Grabación</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Calidad de video</label>
                  <select className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500">
                    <option>1080p (Recomendado)</option>
                    <option>720p</option>
                    <option>480p</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Fuente de audio</label>
                  <select className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500">
                    <option>Micrófono del sistema</option>
                    <option>Micrófono externo</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
