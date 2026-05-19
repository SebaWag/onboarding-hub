import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Video, Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

export default function Login() {
  const navigate = useNavigate()
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({ email: '', password: '', name: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await response.json()
      
      if (data.success) {
        localStorage.setItem('auth_token', data.data.token)
        localStorage.setItem('user', JSON.stringify(data.data.user))
        navigate('/')
      } else {
        setError(data.error || 'Error de autenticacion')
      }
    } catch (err) {
      setError('Error de conexion')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 via-fuchsia-600/20 to-rose-600/20" />
        <div className="relative z-10 flex flex-col justify-center p-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-glow">
              <Video className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">TutorialHub</h1>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4">
            Crea tutoriales que<br />
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">conversan contigo</span>
          </h2>
          <p className="text-surface-300 text-lg mb-8">
            Graba tu pantalla, comparte conocimiento y deja que la IA responda las preguntas de tu equipo.
          </p>
          <div className="space-y-4">
            {[
              { icon: '🎥', text: 'Grabacion de pantalla + camara' },
              { icon: '🤖', text: 'IA que entiende tus tutoriales' },
              { icon: '🔗', text: 'Comparte con links publicos o privados' },
              { icon: '📊', text: 'Analytics detallados' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-surface-200">
                <span className="text-xl">{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">TutorialHub</h1>
          </div>

          <div className="glass rounded-2xl p-8 noise-overlay">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white">{isLogin ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}</h2>
              <p className="text-surface-400 mt-2">{isLogin ? 'Ingresa para continuar' : 'Comienza en minutos'}</p>
            </div>

            <div className="flex gap-1 p-1 rounded-xl bg-surface-900/50 mb-6">
              <button onClick={() => setIsLogin(true)} className={cn('flex-1 py-2 rounded-lg text-sm font-medium transition-all', isLogin ? 'bg-teal-50 text-teal-500' : 'text-surface-400 hover:text-white')}>
                Iniciar Sesion
              </button>
              <button onClick={() => setIsLogin(false)} className={cn('flex-1 py-2 rounded-lg text-sm font-medium transition-all', !isLogin ? 'bg-teal-50 text-teal-500' : 'text-surface-400 hover:text-white')}>
                Registrarse
              </button>
            </div>

            {error && <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-surface-300 mb-2">Nombre completo</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="input-field" placeholder="Juan Perez" required={!isLogin} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                  <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="input-field pl-10" placeholder="tu@empresa.com" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">Contrasena</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-500" />
                  <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="input-field pl-10 pr-10" placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={isLoading} className={cn('w-full py-3 rounded-xl font-medium text-white transition-all flex items-center justify-center gap-2', isLoading ? 'bg-surface-700' : 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:shadow-glow')}>
                {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Cargando...</> : <>{isLogin ? 'Iniciar Sesion' : 'Crear Cuenta'}<ArrowRight className="w-5 h-5" /></>}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
