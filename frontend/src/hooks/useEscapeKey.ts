import { useEffect } from 'react'

/**
 * Cierra con la tecla Escape mientras `active` sea true (B2).
 * Para modales y dropdowns: las páginas lo llaman con el estado del modal.
 */
export function useEscapeKey(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, onClose])
}
