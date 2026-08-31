import type { CSSProperties, ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * Bloque base de skeleton con shimmer (B5).
 * El tamaño/forma se define con className (ej: "w-24 h-7 rounded-full").
 */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('skeleton', className)} style={style} aria-hidden />
}

/** Card contenedora estándar para skeletons de grids. */
export function SkeletonCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-sm', className)}>
      {children}
    </div>
  )
}

/** Conjunto de líneas de texto simuladas. */
export function SkeletonLines({ widths, className }: { widths?: string[]; className?: string }) {
  const rows = widths ?? ['w-3/4', 'w-1/2', 'w-2/3']
  return (
    <div className={cn('space-y-2', className)}>
      {rows.map((w, i) => (
        <Skeleton key={i} className={cn('h-3.5', w)} />
      ))}
    </div>
  )
}
