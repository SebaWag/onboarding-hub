import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { query } from '../db';
import { downloadFile, uploadFile } from './storage';

// =====================================================
// Render de zoom con FFmpeg
//
// "Hornea" las regiones de zoom en un MP4 usando el filtro `zoompan`, cuyas
// expresiones z/x/y varían en el tiempo (`in_time`) y se generan a partir de las
// regiones. Validado empíricamente contra crops de referencia.
// =====================================================

const ZOOM_DEPTH_SCALES: Record<number, number> = {
  1: 1.25,
  2: 1.5,
  3: 1.8,
  4: 2.2,
  5: 3.5,
  6: 5.0,
};

/** Ventana de transición del zoom-in (ms) — igual que el preview. */
const ZOOM_IN_TRANSITION_WINDOW_MS = 1522.575;
/** Ventana de transición del zoom-out (ms). */
const TRANSITION_WINDOW_MS = 1015.05;
/** Solape del zoom-in respecto al inicio de la región (ms). */
const ZOOM_IN_OVERLAP_MS = 500;
/** Tope de regiones incluidas en el filtro (evita expresiones gigantes). */
const MAX_REGIONS_IN_FILTER = 40;

const TEMP_DIR = '/tmp/zoom-render';

export interface ZoomRegionForRender {
  startMs: number;
  endMs: number;
  depth: number;
  focus?: { cx?: number; cy?: number };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampScale = (d: number) => (ZOOM_DEPTH_SCALES[d] ?? 1);

/** smoothstep: aproximación expresable en FFmpeg del easing de entrada/salida. */
function smoothStep(p: string): string {
  return `(${p})*(${p})*(3-2*(${p}))`;
}

/** Normaliza y ordena las regiones entrantes. */
export function sanitizeRegionsForRender(regions: ZoomRegionForRender[]): ZoomRegionForRender[] {
  return regions
    .filter(
      (r) =>
        r &&
        Number.isFinite(r.startMs) &&
        Number.isFinite(r.endMs) &&
        r.endMs > r.startMs &&
        r.startMs >= 0,
    )
    .map((r) => ({
      startMs: Math.round(r.startMs),
      endMs: Math.round(r.endMs),
      depth: Math.max(1, Math.min(6, Math.round(r.depth ?? 2))),
      focus: {
        cx: clamp01(Number(r.focus?.cx ?? 0.5)),
        cy: clamp01(Number(r.focus?.cy ?? 0.5)),
      },
    }))
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, MAX_REGIONS_IN_FILTER);
}

/**
 * Construye el filtro `zoompan` de FFmpeg para las regiones dadas.
 *
 * Las expresiones se anidan de forma que la PRIMERA región que contiene el
 * instante tiene prioridad. Devuelve null si no hay regiones válidas.
 */
export function buildZoomFilter(
  regions: ZoomRegionForRender[],
  width: number,
  height: number,
  fps = 30,
): string | null {
  const clean = sanitizeRegionsForRender(regions);
  if (clean.length === 0) return null;

  // Acumuladores anidados (se construyen en orden inverso para dar prioridad a la 1ª).
  let zExtra = '0';
  let focusX = '0.5';
  let focusY = '0.5';

  for (let i = clean.length - 1; i >= 0; i -= 1) {
    const r = clean[i];
    const t0 = r.startMs / 1000;
    const t1 = r.endMs / 1000;
    const zoomInEnd = t0 + ZOOM_IN_OVERLAP_MS / 1000;
    const leadInStart = zoomInEnd - ZOOM_IN_TRANSITION_WINDOW_MS / 1000;
    const leadOutEnd = t1 + TRANSITION_WINDOW_MS / 1000;

    const pIn = `(in_time-(${leadInStart}))/(${zoomInEnd - leadInStart})`;
    const pOut = `(in_time-(${t1}))/(${leadOutEnd - t1})`;
    const strength = `if(lt(in_time,${zoomInEnd}),${smoothStep(pIn)},if(lt(in_time,${t1}),1,(1-${smoothStep(pOut)})))`;

    const extra = clampScale(r.depth) - 1;
    zExtra = `if(between(in_time,${leadInStart},${leadOutEnd}),(${extra})*(${strength}),${zExtra})`;
    focusX = `if(between(in_time,${leadInStart},${leadOutEnd}),${r.focus!.cx},${focusX})`;
    focusY = `if(between(in_time,${leadInStart},${leadOutEnd}),${r.focus!.cy},${focusY})`;
  }

  const z = `1+(${zExtra})`;
  const x = `max(0,min(iw-iw/zoom,(${focusX})*iw-iw/zoom/2))`;
  const y = `max(0,min(ih-ih/zoom,(${focusY})*ih-ih/zoom/2))`;

  // OJO: el prefijo `fps=N` es OBLIGATORIO. Si el input viene a otro fps (p.ej.
  // 60fps de MediaRecorder) y sólo se le pasa `fps` a zoompan, éste DROPEA frames
  // y comprime el tiempo (~2x): la salida queda con la mitad de los frames y las
  // regiones posteriores caen fuera de su ventana. Reamuestrear ANTES lo evita.
  return `fps=${fps},zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}`;
}

// =====================================================
// Estado de los trabajos (en memoria; el resultado se persiste en metadata)
// =====================================================

export interface ZoomRenderState {
  status: 'idle' | 'rendering' | 'done' | 'error';
  progress: number;
  message?: string;
  key?: string;
  updatedAt: number;
}

const jobs = new Map<string, ZoomRenderState>();

export function getZoomRenderJob(videoId: string): ZoomRenderState {
  return jobs.get(videoId) ?? { status: 'idle', progress: 0, updatedAt: Date.now() };
}

function setJob(videoId: string, patch: Partial<ZoomRenderState>): void {
  const current = getZoomRenderJob(videoId);
  jobs.set(videoId, { ...current, ...patch, updatedAt: Date.now() });
}

function probe(file: string, entries: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'csv=p=0', file]);
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('close', () => resolve(out.trim()));
    proc.on('error', () => resolve(''));
  });
}

/** Lanza el render en segundo plano (no bloquea la respuesta HTTP). */
export async function startZoomRender(videoId: string): Promise<ZoomRenderState> {
  const current = getZoomRenderJob(videoId);
  if (current.status === 'rendering') return current;

  setJob(videoId, { status: 'rendering', progress: 0, message: 'Preparando…', key: undefined });
  void renderInBackground(videoId);
  return getZoomRenderJob(videoId);
}

async function renderInBackground(videoId: string): Promise<void> {
  const srcPath = path.join(TEMP_DIR, `${videoId}.src`);
  const outPath = path.join(TEMP_DIR, `${videoId}.zoom.mp4`);

  try {
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    const videoResult = await query('SELECT storage_key FROM videos WHERE id = $1', [videoId]);
    if (videoResult.rows.length === 0) throw new Error('Video not found');
    const storageKey = videoResult.rows[0].storage_key as string;

    const regionsResult = await query(
      'SELECT start_ms, end_ms, depth, focus_x, focus_y FROM video_zoom_regions WHERE video_id = $1 ORDER BY sort_order, start_ms',
      [videoId],
    );
    const regions: ZoomRegionForRender[] = regionsResult.rows.map((r: any) => ({
      startMs: r.start_ms,
      endMs: r.end_ms,
      depth: r.depth,
      focus: { cx: r.focus_x, cy: r.focus_y },
    }));
    if (regions.length === 0) throw new Error('El video no tiene zonas de zoom');

    setJob(videoId, { message: 'Descargando video…' });
    await downloadFile(storageKey, srcPath);

    const dims = (await probe(srcPath, 'stream=width,height')).split(',');
    const width = parseInt(dims[0], 10) || 1920;
    const height = parseInt(dims[1], 10) || 1080;
    const duration = parseFloat(await probe(srcPath, 'format=duration')) || 0;

    const filter = buildZoomFilter(regions, width, height, 30);
    if (!filter) throw new Error('No se pudo construir el filtro de zoom');

    setJob(videoId, { message: 'Renderizando…', progress: 1 });

    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y',
        '-i',
        srcPath,
        '-vf',
        filter,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '21',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-map_metadata',
        '-1',
        outPath,
      ];
      const proc = spawn('ffmpeg', args);
      let tail = '';
      proc.stderr.on('data', (d) => {
        const text = d.toString();
        tail = (tail + text).slice(-4000);
        const m = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (m && duration > 0) {
          const secs = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
          const pct = Math.max(1, Math.min(99, Math.round((secs / duration) * 100)));
          setJob(videoId, { progress: pct });
        }
      });
      proc.on('error', reject);
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg falló (${code}): ${tail.slice(-400)}`)),
      );
    });

    setJob(videoId, { message: 'Subiendo…', progress: 99 });
    const uploaded = await uploadFile(outPath, `zoom-renders/${videoId}`);

    await query(
      `UPDATE videos
         SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{zoom_render}', $1::jsonb, true),
             updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({ key: uploaded.key, url: uploaded.url, created_at: new Date().toISOString() }), videoId],
    );

    setJob(videoId, { status: 'done', progress: 100, message: 'Listo', key: uploaded.key });
    console.log(`[ZOOM-RENDER] ✅ ${videoId} → ${uploaded.key}`);
  } catch (err: any) {
    console.error(`[ZOOM-RENDER] ❌ ${videoId}:`, err.message);
    setJob(videoId, { status: 'error', progress: 0, message: err.message });
  } finally {
    for (const p of [srcPath, outPath]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* noop */
      }
    }
  }
}
