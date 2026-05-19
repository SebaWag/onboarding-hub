import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { query } from '../db';
import { getFileStream, getFileInfo, getPublicUrl } from '../services/storage';
import crypto from 'crypto';

const router = Router();

// =====================================================
// LIKE / ÚTIL
// =====================================================

// GET /api/videos/:id/like - Check if user liked
router.get('/:id/like', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const userId = req.user!.id;

    const likeCheck = await query(
      'SELECT id FROM video_likes WHERE video_id = $1 AND user_id = $2',
      [videoId, userId]
    );

    const countResult = await query(
      'SELECT COUNT(*) as total FROM video_likes WHERE video_id = $1',
      [videoId]
    );

    res.json({
      success: true,
      data: {
        liked: likeCheck.rows.length > 0,
        count: parseInt(countResult.rows[0].total, 10),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/videos/:id/like - Toggle like
router.post('/:id/like', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const userId = req.user!.id;

    // Verificar que el video existe
    const videoCheck = await query('SELECT id FROM videos WHERE id = $1', [videoId]);
    if (videoCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video not found' });
      return;
    }

    // Toggle: si ya existe, eliminar; si no, crear
    const existing = await query(
      'SELECT id FROM video_likes WHERE video_id = $1 AND user_id = $2',
      [videoId, userId]
    );

    let liked: boolean;
    if (existing.rows.length > 0) {
      await query('DELETE FROM video_likes WHERE video_id = $1 AND user_id = $2', [videoId, userId]);
      liked = false;
    } else {
      await query(
        'INSERT INTO video_likes (video_id, user_id) VALUES ($1, $2)',
        [videoId, userId]
      );
      liked = true;
    }

    const countResult = await query(
      'SELECT COUNT(*) as total FROM video_likes WHERE video_id = $1',
      [videoId]
    );

    res.json({
      success: true,
      data: {
        liked,
        count: parseInt(countResult.rows[0].total, 10),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// BOOKMARK / GUARDAR
// =====================================================

// GET /api/videos/:id/bookmark - Check if user bookmarked
router.get('/:id/bookmark', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const userId = req.user!.id;

    const bmCheck = await query(
      'SELECT id FROM video_bookmarks WHERE video_id = $1 AND user_id = $2',
      [videoId, userId]
    );

    res.json({
      success: true,
      data: {
        bookmarked: bmCheck.rows.length > 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/videos/:id/bookmark - Toggle bookmark
router.post('/:id/bookmark', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const userId = req.user!.id;

    // Verificar que el video existe
    const videoCheck = await query('SELECT id FROM videos WHERE id = $1', [videoId]);
    if (videoCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video not found' });
      return;
    }

    const existing = await query(
      'SELECT id FROM video_bookmarks WHERE video_id = $1 AND user_id = $2',
      [videoId, userId]
    );

    let bookmarked: boolean;
    if (existing.rows.length > 0) {
      await query('DELETE FROM video_bookmarks WHERE video_id = $1 AND user_id = $2', [videoId, userId]);
      bookmarked = false;
    } else {
      await query(
        'INSERT INTO video_bookmarks (video_id, user_id) VALUES ($1, $2)',
        [videoId, userId]
      );
      bookmarked = true;
    }

    res.json({
      success: true,
      data: { bookmarked },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// SHARE / COMPARTIR
// =====================================================

// POST /api/videos/:id/share - Generate share link
router.post('/:id/share', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const userId = req.user!.id;
    const { password, expires_in_hours } = req.body;

    // Verificar que el video existe y pertenece a la org del usuario
    const videoCheck = await query(
      `SELECT v.id, v.org_id FROM videos v
       JOIN org_members om ON v.org_id = om.org_id
       WHERE v.id = $1 AND om.user_id = $2`,
      [videoId, userId]
    );
    if (videoCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video not found or access denied' });
      return;
    }

    // Generar token único
    const shareToken = crypto.randomBytes(32).toString('hex');

    // Calcular expiración
    let expiresAt = null;
    if (expires_in_hours) {
      expiresAt = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000);
    }

    // Hash del password si se proporciona
    let passwordHash = null;
    if (password) {
      passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    }

    // Crear share record
    const result = await query(
      `INSERT INTO video_shares (video_id, created_by, share_token, password_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, share_token, expires_at, created_at`,
      [videoId, userId, shareToken, passwordHash, expiresAt]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8090';
    const shareUrl = `${frontendUrl}/share/${shareToken}`;

    res.json({
      success: true,
      data: {
        share_url: shareUrl,
        share_token: shareToken,
        expires_at: result.rows[0].expires_at,
        has_password: !!password,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// DOWNLOAD / DESCARGAR
// =====================================================

// GET /api/videos/:id/download - Download video file
router.get('/:id/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const videoId = req.params.id;
    const userId = req.user!.id;

    // Verificar acceso
    const videoCheck = await query(
      `SELECT v.id, v.title, v.storage_key FROM videos v
       JOIN org_members om ON v.org_id = om.org_id
       WHERE v.id = $1 AND om.user_id = $2`,
      [videoId, userId]
    );

    if (videoCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video not found or access denied' });
      return;
    }

    const video = videoCheck.rows[0];
    const storageKey = video.storage_key;

    if (!storageKey) {
      res.status(404).json({ success: false, error: 'Video file not found in storage' });
      return;
    }

    // Obtener info del archivo
    let fileInfo;
    try {
      fileInfo = await getFileInfo(storageKey);
    } catch {
      res.status(404).json({ success: false, error: 'Video file not found in storage' });
      return;
    }

    // Determinar extensión y content type
    const ext = storageKey.split('.').pop() || 'webm';
    const contentTypes: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
    };
    const contentType = contentTypes[ext] || 'video/webm';

    // Sanitizar título para nombre de archivo
    const safeTitle = video.title
      .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
    const filename = `${safeTitle}.${ext}`;

    // Obtener stream del archivo
    const fileStream = await getFileStream(storageKey);

    // Configurar headers de descarga
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.set('Content-Length', String(fileInfo.size));
    res.set('Cache-Control', 'no-cache');

    // Stream al cliente
    const stream = fileStream.Body as NodeJS.ReadableStream;
    stream.pipe(res);
  } catch (err: any) {
    console.error('Download error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
