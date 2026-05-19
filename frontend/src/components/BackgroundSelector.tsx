import { X, Check, Camera, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'
import { BACKGROUND_COLORS } from '../hooks/useBackgroundRemoval'

interface Props {
  currentBackground: any
  isModelReady: boolean
  onSelect: (option: any) => void
  onClose: () => void
  isOpen: boolean
}

export default function BackgroundSelector({ currentBackground, onSelect, onClose, isOpen }: Props) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Fondo de Camara</h3>
              <p className="text-xs text-slate-400">Selecciona un fondo virtual</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <button onClick={() => onSelect({ mode: 'none', label: 'Sin fondo' })}
            className={cn('w-full flex items-center gap-3 p-3 rounded-xl transition-all', currentBackground.mode === 'none' ? 'bg-violet-500/20 ring-2 ring-violet-500' : 'bg-slate-700/50 hover:bg-slate-700')}>
            <div className="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center">
              <Camera className="w-5 h-5 text-slate-300" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">Original</p>
              <p className="text-xs text-slate-400">Sin efectos de fondo</p>
            </div>
            {currentBackground.mode === 'none' && (
              <div className="ml-auto w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>
          <p className="text-xs text-slate-400 font-medium pt-2">Fondos virtuales</p>
          <div className="grid grid-cols-3 gap-2">
            {BACKGROUND_COLORS.map((item: any) => {
              const sel = currentBackground.label === item.label
              const mx = item.mode === 'matrix'
              return (
                <button key={item.label} onClick={() => onSelect({ mode: item.mode, color: item.color, label: item.label })}
                  className={cn('relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all', sel ? 'ring-2 ring-violet-500 bg-violet-500/10' : 'hover:bg-slate-700/50')}>
                  <div className={cn('w-full h-12 rounded-lg border border-white/10 shadow-sm flex items-center justify-center overflow-hidden', mx ? 'bg-black' : '')}
                    style={!mx ? { backgroundColor: item.color } : {}}>
                    {mx && <span className="text-[8px] text-green-400 font-mono">01 10 01</span>}
                  </div>
                  <span className={cn('text-[10px] truncate w-full text-center', sel ? 'text-violet-400' : 'text-slate-400')}>{item.label}</span>
                  {sel && <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                </button>
              )
            })}
          </div>
          {currentBackground.mode !== 'none' && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-300">Fondo activo: <strong>{currentBackground.label}</strong></span>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-slate-700 bg-slate-900/30">
          <p className="text-[10px] text-slate-500 text-center">Detecta tu rostro por color de piel. Buena iluminacion mejora el resultado.</p>
        </div>
      </div>
    </div>
  )
}
