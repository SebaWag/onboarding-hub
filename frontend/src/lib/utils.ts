import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date))
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return minutes + ' min'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? hours + 'h ' + mins + 'min' : hours + 'h'
}
