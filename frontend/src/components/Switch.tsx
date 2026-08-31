import { cn } from '../lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel?: string
}

/**
 * Toggle accesible con knob animado (B8). Teal cuando activo.
 * Reemplaza los toggles decorativos (div sin estado ni onClick).
 */
export default function Switch({ checked, onChange, ariaLabel }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-11 h-6 rounded-full p-0.5 shrink-0 transition-colors duration-200',
        checked ? 'bg-teal-500' : 'bg-surface-300 dark:bg-surface-700'
      )}
    >
      <span
        className={cn(
          'block w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
          checked && 'translate-x-5'
        )}
      />
    </button>
  )
}
