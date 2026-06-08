import { X, Check, Camera, Sparkles, Image as ImageIcon } from 'lucide-react'
import { cn } from '../lib/utils'
import { BACKGROUNDS } from '../hooks/useBackgroundRemoval'
import type { BackgroundOption } from '../hooks/useBackgroundRemoval'

interface Props {
  currentBackground: BackgroundOption
  isModelReady: boolean
  modelLoading?: boolean
  onSelect: (option: BackgroundOption) => void
  onClose: () => void
  isOpen: boolean
}

export default function BackgroundSelector({
  currentBackground, isModelReady, modelLoading, onSelect, onClose, isOpen,
}: Props) {
  if (!isOpen) return null

  const solidColors = BACKGROUNDS.filter(b => b.mode === 'color')
  const images = BACKGROUNDS.filter(b => b.mode === 'image')
  const effects = BACKGROUNDS.filter(b => b.mode === 'matrix' || b.mode === 'none')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Fondo de Cámara</h3>
              <p className="text-xs text-slate-400">
                {modelLoading
                  ? 'Cargando IA de segmentación...'
                  : isModelReady
                    ? 'IA activa — segmentación precisa'
                    : 'Modo básico — detección por color'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Sin fondo */}
          <button onClick={() => onSelect(effects[0])}
            className={cn('w-full flex items-center gap-3 p-3 rounded-xl transition-all',
              currentBackground.mode === 'none' ? 'bg-violet-500/20 ring-2 ring-violet-500' : 'bg-slate-700/50 hover:bg-slate-700')}>
            <div className="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center">
              <Camera className="w-5 h-5 text-slate-300" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium text-white">Original</p>
              <p className="text-xs text-slate-400">Sin efectos de fondo</p>
            </div>
            {currentBackground.mode === 'none' && <Check className="w-5 h-5 text-violet-400" />}
          </button>

          {/* Fondos con Imagen */}
          {images.length > 0 && (
            <>
              <p className="text-xs text-slate-400 font-medium pt-1">🌆 Escenarios profesionales</p>
              <div className="grid grid-cols-2 gap-2">
                {images.map((item) => {
                  const sel = currentBackground.label === item.label
                  return (
                    <button key={item.label} onClick={() => onSelect(item)}
                      className={cn('relative flex flex-col items-center rounded-xl overflow-hidden transition-all border',
                        sel ? 'ring-2 ring-violet-500 border-violet-500' : 'border-slate-700 hover:border-slate-500')}>
                      <div className="w-full h-20 bg-slate-700 relative">
                        {item.thumbnail && (
                          <img src={item.thumbnail} alt={item.label}
                            className="w-full h-full object-cover"
                            loading="lazy" />
                        )}
                        {sel && (
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="w-full p-1.5 bg-slate-900/80 text-center">
                        <span className={cn('text-[10px]', sel ? 'text-violet-400' : 'text-slate-300')}>
                          {item.label}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Colores sólidos */}
          <p className="text-xs text-slate-400 font-medium pt-1">🎨 Colores sólidos</p>
          <div className="grid grid-cols-4 gap-2">
            {solidColors.map((item) => {
              const sel = currentBackground.label === item.label
              return (
                <button key={item.label} onClick={() => onSelect(item)}
                  className={cn('relative flex flex-col items-center gap-1 p-2 rounded-xl transition-all',
                    sel ? 'ring-2 ring-violet-500 bg-violet-500/10' : 'hover:bg-slate-700/50')}>
                  <div className="w-full h-10 rounded-lg border border-white/10 shadow-sm"
                    style={{ backgroundColor: item.color }} />
                  <span className={cn('text-[10px] truncate w-full text-center',
                    sel ? 'text-violet-400' : 'text-slate-400')}>{item.label}</span>
                  {sel && <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white" /></div>}
                </button>
              )
            })}
          </div>

          {/* Efectos */}
          <p className="text-xs text-slate-400 font-medium pt-1">✨ Efectos</p>
          <div className="grid grid-cols-1 gap-2">
            {effects.filter(e => e.mode !== 'none').map((item) => {
              const sel = currentBackground.label === item.label
              return (
                <button key={item.label} onClick={() => onSelect(item)}
                  className={cn('flex items-center gap-3 p-3 rounded-xl transition-all',
                    sel ? 'bg-violet-500/20 ring-2 ring-violet-500' : 'bg-slate-700/50 hover:bg-slate-700')}>
                  <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center border border-green-500/30">
                    <span className="text-[10px] text-green-400 font-mono">01</span>
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="text-xs text-slate-400">Efecto Matrix estilo hacker</p>
                  </div>
                  {sel && <Check className="w-5 h-5 text-violet-400" />}
                </button>
              )
            })}
          </div>

          {/* Status badge */}
          {currentBackground.mode !== 'none' && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-300">
                {isModelReady ? '🤖 IA segmentando persona del fondo' : '🎨 Modo básico activo'}
                — <strong>{currentBackground.label}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-700 bg-slate-900/30">
          <p className="text-[10px] text-slate-500 text-center">
            {isModelReady
              ? '🤖 Segmentación por IA — funciona con cualquier iluminación y tono de piel'
              : '💡 Para mejor precisión, buena iluminación y fondo uniforme'}
          </p>
        </div>
      </div>
    </div>
  )
}
