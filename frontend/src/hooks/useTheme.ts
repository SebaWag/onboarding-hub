import { useState, useEffect } from 'react'

export function useTheme() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    setIsDark(saved !== 'light')
  }, [])

  return { isDark, setIsDark }
}

// Clases para texto que se adaptan al tema
export function textClass(isDark: boolean, primary = true) {
  if (primary) {
    return isDark ? 'text-white' : 'text-slate-900'
  }
  return isDark ? 'text-gray-300' : 'text-slate-700'
}

// Clases para fondos
export function bgClass(isDark: boolean) {
  return isDark ? 'bg-surface-950' : 'bg-slate-50'
}

export function cardClass(isDark: boolean) {
  return isDark ? 'bg-surface-800' : 'bg-white'
}

export function mutedClass(isDark: boolean) {
  return isDark ? 'text-gray-500' : 'text-slate-500'
}
