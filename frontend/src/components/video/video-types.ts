/** Tipos compartidos del modulo de detalle de video. */

export interface TranscriptSegment {
  time: string
  text: string
  start: number
  end: number
}

export interface Chapter {
  time: string
  title: string
  duration?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isLoading?: boolean
  videoRef?: string | null
}

export interface VideoComment {
  id: string
  user_name?: string
  content: string
  parent_id: string | null
  timestamp_seconds: number | null
  is_resolved: boolean
  created_at: string
}

export interface VideoData {
  id: string
  title: string
  description: string | null
  storage_key: string
  duration_seconds?: number
  created_at?: string
  thumbnail_url?: string | null
  transcript: string | null
  transcript_segments: TranscriptSegment[] | null
  metadata: Record<string, unknown>
  status: string
  created_by: string
}

/** Formatea segundos a mm:ss / h:mm:ss */
export const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Convierte mm:ss o h:mm:ss a segundos */
export const parseTimeToSeconds = (time: string): number => {
  const parts = time.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}
