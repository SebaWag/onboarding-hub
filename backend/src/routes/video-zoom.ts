import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import pool, { query } from '../db';
import { internalError } from '../utils/http';
import { getZoomRenderJob, startZoomRender } from '../services/zoom-render';

const router = Router();

/** Máximo de muestras aceptadas por video (protege la DB y el límite de body). */
const MAX_TELEMETRY_SAMPLES = 50_000;
/** Máximo de regiones por video. */
const MAX_REGIONS = 200;

type AccessResult = 'ok' | 'not_found' | 'forbidden';

/**
 * Verifica que el usuario pueda tocar el video (existe y pertenece a una de sus orgs).
 */
async function assertVideoAccess(userId: string, videoId: string): Promise<AccessResult> {
  const video = await query('SELECT org_id FROM videos WHERE id = $1', [videoId]);
  if (video.rows.length === 0) return 'not_found';

  const orgId = video.rows[0].org_id;
  if (!orgId) return 'ok';

  const member = await query('SELECT 1 FROM org_members WHERE user_id = $1 AND org_id = $2', [
    userId,
    orgId,
  ]);
  return member.rows.length > 0 ? 'ok' : 'forbidden';
}

function deny(res: Response, result: AccessResult): void {
  if (result === 'not_found') {
    res.status(404).json({ success: false, error: 'Video not found' });
    return;
  }
  res.status(403).json({ success: false, error: 'Access denied to this video' });
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const toInt = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

interface RegionInput {
  id?: string;
  startMs?: number;
  endMs?: number;
  depth?: number;
  focus?: { cx?: number; cy?: number };
  mode?: string;
}

/** Normaliza y valida una región entrante. Devuelve null si es inválida. */
function sanitizeRegion(raw: RegionInput, index: number) {
  const rawStart = toInt(raw?.startMs, -1);
  const rawEnd = toInt(raw?.endMs, -1);
  // Rechaza regiones sin tiempos válidos o de duración no positiva.
  if (rawStart < 0 || rawEnd <= rawStart) return null;

  const startMs = clamp(rawStart, 0, Number.MAX_SAFE_INTEGER);
  const endMs = clamp(rawEnd, 0, Number.MAX_SAFE_INTEGER);

  const depth = clamp(toInt(raw?.depth, 2), 1, 6);
  const mode = raw?.mode === 'manual' ? 'manual' : 'auto';
  const regionKey =
    typeof raw?.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim().slice(0, 64) : `region-${index + 1}`;

  return {
    regionKey,
    startMs,
    endMs,
    depth,
    focusX: clamp01(Number(raw?.focus?.cx ?? 0.5)),
    focusY: clamp01(Number(raw?.focus?.cy ?? 0.5)),
    mode,
    sortOrder: index,
  };
}

interface SampleInput {
  timeMs?: number;
  cx?: number;
  cy?: number;
  interactionType?: string;
  cursorType?: string;
}

/** Normaliza un sample de cursor. Devuelve null si es inválido. */
function sanitizeSample(raw: SampleInput) {
  const timeMs = toInt(raw?.timeMs, -1);
  const cx = Number(raw?.cx);
  const cy = Number(raw?.cy);
  if (timeMs < 0 || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  const sample: {
    timeMs: number;
    cx: number;
    cy: number;
    interactionType?: string;
    cursorType?: string;
  } = { timeMs, cx: clamp01(cx), cy: clamp01(cy) };
  if (typeof raw?.interactionType === 'string') sample.interactionType = raw.interactionType.slice(0, 24);
  if (typeof raw?.cursorType === 'string') sample.cursorType = raw.cursorType.slice(0, 24);
  return sample;
}

// =====================================================
// REGIONES DE ZOOM
// =====================================================

// GET /api/videos/:id/zoom-regions
router.get('/:id/zoom-regions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const access = await assertVideoAccess(req.user!.id, videoId);
    if (access !== 'ok') {
      deny(res, access);
      return;
    }

    const result = await query(
      `SELECT region_key, start_ms, end_ms, depth, focus_x, focus_y, mode, sort_order
       FROM video_zoom_regions
       WHERE video_id = $1
       ORDER BY sort_order ASC, start_ms ASC`,
      [videoId]
    );

    const regions = result.rows.map((row: any) => ({
      id: row.region_key,
      startMs: row.start_ms,
      endMs: row.end_ms,
      depth: row.depth,
      focus: { cx: row.focus_x, cy: row.focus_y },
      mode: row.mode,
    }));

    res.json({ success: true, data: regions });
  } catch (err: any) {
    internalError(res, err);
  }
});

// PUT /api/videos/:id/zoom-regions  { regions: ZoomRegion[] }  -> reemplaza todo
router.put('/:id/zoom-regions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const access = await assertVideoAccess(req.user!.id, videoId);
    if (access !== 'ok') {
      deny(res, access);
      return;
    }

    const incoming = Array.isArray(req.body?.regions) ? (req.body.regions as RegionInput[]) : null;
    if (!incoming) {
      res.status(400).json({ success: false, error: 'regions must be an array' });
      return;
    }
    if (incoming.length > MAX_REGIONS) {
      res.status(400).json({ success: false, error: `Too many regions (max ${MAX_REGIONS})` });
      return;
    }

    const sanitized = incoming
      .map((raw, index) => sanitizeRegion(raw, index))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Reemplazo atómico (DELETE + INSERT en una transacción).
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM video_zoom_regions WHERE video_id = $1', [videoId]);
      for (const r of sanitized) {
        await client.query(
          `INSERT INTO video_zoom_regions
             (video_id, region_key, start_ms, end_ms, depth, focus_x, focus_y, mode, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [videoId, r.regionKey, r.startMs, r.endMs, r.depth, r.focusX, r.focusY, r.mode, r.sortOrder]
        );
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ success: true, data: sanitized.length });
  } catch (err: any) {
    internalError(res, err);
  }
});

// =====================================================
// TELEMETRÍA DE CURSOR
// =====================================================

// GET /api/videos/:id/cursor-telemetry
router.get('/:id/cursor-telemetry', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const access = await assertVideoAccess(req.user!.id, videoId);
    if (access !== 'ok') {
      deny(res, access);
      return;
    }

    const result = await query(
      'SELECT samples, sample_count FROM video_cursor_telemetry WHERE video_id = $1',
      [videoId]
    );

    if (result.rows.length === 0) {
      res.json({ success: true, data: { samples: [], sampleCount: 0 } });
      return;
    }

    res.json({
      success: true,
      data: { samples: result.rows[0].samples, sampleCount: result.rows[0].sample_count },
    });
  } catch (err: any) {
    internalError(res, err);
  }
});

// PUT /api/videos/:id/cursor-telemetry  { samples: CursorTelemetryPoint[] } -> upsert
router.put('/:id/cursor-telemetry', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const access = await assertVideoAccess(req.user!.id, videoId);
    if (access !== 'ok') {
      deny(res, access);
      return;
    }

    const incoming = Array.isArray(req.body?.samples) ? (req.body.samples as SampleInput[]) : null;
    if (!incoming) {
      res.status(400).json({ success: false, error: 'samples must be an array' });
      return;
    }
    if (incoming.length > MAX_TELEMETRY_SAMPLES) {
      res.status(413).json({
        success: false,
        error: `Too many samples (max ${MAX_TELEMETRY_SAMPLES})`,
      });
      return;
    }

    const sanitized = incoming
      .map((raw) => sanitizeSample(raw))
      .filter((s): s is NonNullable<typeof s> => s !== null);

    await query(
      `INSERT INTO video_cursor_telemetry (video_id, samples, sample_count, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (video_id)
       DO UPDATE SET samples = EXCLUDED.samples,
                     sample_count = EXCLUDED.sample_count,
                     updated_at = NOW()`,
      [videoId, JSON.stringify(sanitized), sanitized.length]
    );

    res.json({ success: true, data: { sampleCount: sanitized.length } });
  } catch (err: any) {
    internalError(res, err);
  }
});

// =====================================================
// RENDER (exportar el zoom "horneado" en un MP4)
// =====================================================

// POST /api/videos/:id/zoom-render — lanza el render en segundo plano
router.post('/:id/zoom-render', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const access = await assertVideoAccess(req.user!.id, videoId);
    if (access !== 'ok') {
      deny(res, access);
      return;
    }
    const state = await startZoomRender(videoId);
    res.json({ success: true, data: state });
  } catch (err: any) {
    internalError(res, err);
  }
});

// GET /api/videos/:id/zoom-render — estado del render + key del resultado
router.get('/:id/zoom-render', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const access = await assertVideoAccess(req.user!.id, videoId);
    if (access !== 'ok') {
      deny(res, access);
      return;
    }

    const job = getZoomRenderJob(videoId);
    if (job.status === 'rendering' || job.status === 'error') {
      res.json({ success: true, data: job });
      return;
    }

    // Sin trabajo activo: devolver el render persistido (si existe).
    const result = await query('SELECT metadata FROM videos WHERE id = $1', [videoId]);
    const persisted = result.rows[0]?.metadata?.zoom_render;
    if (persisted?.key) {
      res.json({
        success: true,
        data: { status: 'done', progress: 100, key: persisted.key, updatedAt: Date.now() },
      });
      return;
    }

    res.json({ success: true, data: job });
  } catch (err: any) {
    internalError(res, err);
  }
});

export default router;
