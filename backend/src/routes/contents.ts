import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

// GET /api/contents/module/:moduleId
router.get('/module/:moduleId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { moduleId } = req.params;

    const result = await query(
      `SELECT c.*, v.id as video_id, v.title as video_title, v.duration_seconds, v.status as video_status
       FROM contents c
       LEFT JOIN videos v ON v.content_id = c.id
       WHERE c.module_id = $1
       ORDER BY c.order_index ASC`,
      [moduleId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/contents
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { module_id, type, title, description, video_id, content_url, duration_seconds } = req.body;

    if (!module_id || !type || !title) {
      return res.status(400).json({ success: false, error: 'module_id, type, and title are required' });
    }

    const maxOrder = await query(
      'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM contents WHERE module_id = $1',
      [module_id]
    );
    const nextOrder = maxOrder.rows[0].next_order;

    // Si hay video_id, obtener datos del video
    let storageUrl = content_url;
    let videoDuration = duration_seconds || 0;
    if (video_id) {
      const videoResult = await query(
        'SELECT storage_key, duration_seconds FROM videos WHERE id = $1',
        [video_id]
      );
      if (videoResult.rows.length > 0) {
        storageUrl = videoResult.rows[0].storage_key;
        videoDuration = videoResult.rows[0].duration_seconds || videoDuration;
      }
    }

    // Crear el contenido
    const result = await query(
      `INSERT INTO contents (module_id, content_type, title, description, order_index, content_url, duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [module_id, type, title, description || null, nextOrder, storageUrl, videoDuration]
    );

    const content = result.rows[0];

    // Vincular video al contenido
    if (video_id) {
      await query('UPDATE videos SET content_id = $1 WHERE id = $2', [content.id, video_id]);
    }

    res.status(201).json({ success: true, data: content });
  } catch (err: any) {
    console.error('Create content error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/contents/:id
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, order_index } = req.body;

    const result = await query(
      `UPDATE contents SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         order_index = COALESCE($3, order_index)
       WHERE id = $4
       RETURNING *`,
      [title, description, order_index, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Content not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/contents/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Desvincular video si existe
    await query('UPDATE videos SET content_id = NULL WHERE content_id = $1', [id]);
    await query('DELETE FROM contents WHERE id = $1', [id]);
    res.json({ success: true, message: 'Content deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
