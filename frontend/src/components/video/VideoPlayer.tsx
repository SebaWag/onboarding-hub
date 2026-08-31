import type { RefObject } from 'react'
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward,
  Sparkles } from 'lucide-react'
import { formatTime, parseTimeToSeconds, type Chapter } from './video-types'

interface VideoPlayerProps {
  videoRef: RefObject<HTMLVideoElement | null>
  videoContainerRef: RefObject<HTMLDivElement | null>
  videoSrc: string
  /** URL del poster (portada) a mostrar antes de reproducir. */
  poster?: string
  isPlaying: boolean
  setIsPlaying: (v: boolean) => void
  currentTime: number
  setCurrentTime: (v: number) => void
  duration: number
  setDuration: (v: number) => void
  volume: number
  isMuted: boolean
  isFullscreen: boolean
  chapters: Chapter[]
  togglePlay: () => void
  skip: (seconds: number) => void
  toggleMute: () => void
  handleVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  toggleFullscreen: () => void
  handleProgressClick: (e: React.MouseEvent<HTMLDivElement>) => void
}

/**
 * Actualiza la duración SOLO si el valor reportado por el <video> es válido
 * y MAYOR que el que ya tenemos.
 *
 * Los .webm grabados con MediaRecorder no traen la duración en el header:
 * el navegador la "estima" al inicio (probe) pero la recalcula mientras
 * decodifica, reportando valores parciales (ej: 7-9s en videos largos).
 * Como el padre inicializa `duration` con `duration_seconds` de la BD
 * (valor correcto), aquí nunca permitimos que un valor parcial la baje.
 */
function syncDuration(
  videoRef: RefObject<HTMLVideoElement | null>,
  currentDuration: number,
  setDuration: (v: number) => void,
) {
  const el = videoRef.current
  if (!el) return
  const d = el.duration
  if (isFinite(d) && d > 0 && d > currentDuration) {
    setDuration(d)
  }
}

/** Reproductor de video con overlay, controles y marcadores de capitulos. */
export default function VideoPlayer({
  videoRef, videoContainerRef, videoSrc, poster, isPlaying, setIsPlaying,
  currentTime, setCurrentTime, duration, setDuration, volume, isMuted,
  isFullscreen, chapters, togglePlay, skip, toggleMute,
  handleVolumeChange, toggleFullscreen, handleProgressClick,
}: VideoPlayerProps) {
  return (
    <>
          {/* Video Player */}
          <div className="glass rounded-2xl overflow-hidden noise-overlay" ref={videoContainerRef}>
            <div className="relative aspect-video bg-surface-950 group">
              <video
                ref={videoRef}
                src={videoSrc}
                poster={poster}
                className="w-full h-full object-contain bg-black"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                onLoadedMetadata={() => syncDuration(videoRef, duration, setDuration)}
                onDurationChange={() => syncDuration(videoRef, duration, setDuration)}
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
                playsInline
              />

              {/* Play overlay when paused */}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer" onClick={togglePlay}>
                  <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                    <Play className="w-8 h-8 text-white ml-1" />
                  </div>
                </div>
              )}

              {/* AI badge */}
              <div className="absolute top-4 right-4">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 backdrop-blur-sm border border-teal-500/30">
                  <Sparkles className="w-4 h-4 text-teal-500" />
                  <span className="text-xs text-teal-300">IA Activa</span>
                </div>
              </div>

              {/* Current timestamp */}
              <div className="absolute top-4 left-4">
                <div className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm">
                  <span className="text-xs font-mono text-white">{formatTime(currentTime)}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="p-4 border-t border-white/5">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-surface-400 mb-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div
                  className="h-1.5 bg-surface-800 rounded-full overflow-hidden cursor-pointer relative group/progress"
                  onClick={handleProgressClick}
                >
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all relative"
                    style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                  </div>
                  {/* Chapter markers */}
                  {chapters.map((ch, i) => {
                    const pct = (parseTimeToSeconds(ch.time) / (duration || 1)) * 100
                    return (
                      <div
                        key={i}
                        className="absolute top-0 w-0.5 h-full bg-white/30"
                        style={{ left: `${pct}%` }}
                        title={ch.title}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => skip(-10)} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
                    <SkipBack className="w-5 h-5" />
                  </button>
                  <button onClick={togglePlay} className="p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors">
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </button>
                  <button onClick={() => skip(10)} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
                    <SkipForward className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 group/vol">
                    <button onClick={toggleMute} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
                      {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </button>
                    <input
                      type="range" min="0" max="1" step="0.05" value={volume}
                      onChange={handleVolumeChange}
                      className="w-20 h-1 accent-teal-500 opacity-0 group-hover/vol:opacity-100 transition-opacity"
                    />
                  </div>
                  <button onClick={toggleFullscreen} className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-white/5 transition-colors">
                    {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
    </>
  )
}
