/**
 * Sistema mínimo de toasts + dialog de confirmación (P1-B3).
 * Reemplaza los alert()/confirm() nativos por feedback con la marca.
 *
 * Uso:
 *   const toast = useToast()
 *   toast.success('Video eliminado correctamente')
 *   toast.error('No se pudo subir el archivo')
 *   toast.warning('Completa el título y la URL')
 *   const ok = await toast.confirm({ title: '¿Eliminar este video?', variant: 'danger' })
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from './utils'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** danger = botón rojo (destructivo), warning = ámbar, info = teal */
  variant?: 'danger' | 'warning' | 'info'
}

interface ToastItem {
  id: number
  variant: ToastVariant
  message: string
  description?: string
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 3500
const MAX_VISIBLE = 5

const VARIANT_CONFIG = {
  success: { icon: CheckCircle2, iconClass: 'text-teal-500', barClass: 'bg-teal-500' },
  error: { icon: AlertCircle, iconClass: 'text-rose-500', barClass: 'bg-rose-500' },
  info: { icon: Info, iconClass: 'text-sky-500', barClass: 'bg-sky-500' },
  warning: { icon: AlertTriangle, iconClass: 'text-amber-500', barClass: 'bg-amber-500' },
} as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null)
  const idRef = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const resolveConfirm = useRef<((ok: boolean) => void) | null>(null)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = ++idRef.current
      // Cola: conserva solo los últimos MAX_VISIBLE
      setToasts(prev => [...prev, { id, variant, message }].slice(-MAX_VISIBLE))
      timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS))
    },
    [dismiss],
  )

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      // Si había un confirm pendiente, se cierra con false
      resolveConfirm.current?.(false)
      resolveConfirm.current = resolve
      setConfirmOptions(options)
    })
  }, [])

  const settleConfirm = useCallback((ok: boolean) => {
    resolveConfirm.current?.(ok)
    resolveConfirm.current = null
    setConfirmOptions(null)
  }, [])

  // Esc cierra el dialog de confirmación
  useEffect(() => {
    if (!confirmOptions) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settleConfirm(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [confirmOptions, settleConfirm])

  // Cleanup de timers al desmontar
  useEffect(() => () => timers.current.forEach(t => clearTimeout(t)), [])

  const value: ToastContextValue = {
    toast: (message, variant) => push(message, variant),
    success: message => push(message, 'success'),
    error: message => push(message, 'error'),
    info: message => push(message, 'info'),
    warning: message => push(message, 'warning'),
    confirm,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Viewport de toasts: top-right, sobre modales (z-[100]) */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-[100] flex flex-col items-end gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
      >
        {toasts.map(t => {
          const v = VARIANT_CONFIG[t.variant]
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto relative overflow-hidden animate-slide-up flex items-start gap-3 p-3.5 pr-10 w-full rounded-xl bg-[var(--bg-card)] border border-[var(--border)] shadow-lg shadow-black/10"
            >
              <span className={cn('absolute left-0 top-0 bottom-0 w-1', v.barClass)} aria-hidden />
              <v.icon className={cn('w-5 h-5 shrink-0 mt-0.5', v.iconClass)} aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text)]">{t.message}</p>
                {t.description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{t.description}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar"
                className="absolute top-2.5 right-2.5 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Dialog de confirmación (reemplaza window.confirm) */}
      {confirmOptions && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => settleConfirm(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-sm rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl p-5 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  confirmOptions.variant === 'danger' && 'bg-rose-500/10 text-rose-500',
                  confirmOptions.variant === 'warning' && 'bg-amber-500/10 text-amber-500',
                  (!confirmOptions.variant || confirmOptions.variant === 'info') && 'bg-teal-500/10 text-teal-500',
                )}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-[var(--text)]">{confirmOptions.title}</h3>
                {confirmOptions.description && (
                  <p className="text-sm text-[var(--text-secondary)] mt-1">{confirmOptions.description}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => settleConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                {confirmOptions.cancelText ?? 'Cancelar'}
              </button>
              <button
                onClick={() => settleConfirm(true)}
                autoFocus
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors',
                  confirmOptions.variant === 'danger' && 'bg-rose-500 hover:bg-rose-600',
                  confirmOptions.variant === 'warning' && 'bg-amber-500 hover:bg-amber-600',
                  (!confirmOptions.variant || confirmOptions.variant === 'info') && 'bg-teal-500 hover:bg-teal-600',
                )}
              >
                {confirmOptions.confirmText ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
