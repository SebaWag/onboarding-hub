import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { query } from '../db';
import { uploadBuffer, getFileBuffer } from '../services/storage';
import fs from 'fs';
import { execSync } from 'child_process';

const router = Router();

// GET /api/videos - Listar videos de la organización
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { org_id, status } = req.query;
    const userId = req.user!.id;

    let orgId = org_id as string;
    if (!orgId) {
      const userOrg = await query(
        'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      if (userOrg.rows.length === 0) {
        res.status(400).json({ success: false, error: 'User not associated with any organization' });
        return;
      }
      orgId = userOrg.rows[0].org_id;
    }

    const memberCheck = await query(
      'SELECT 1 FROM org_members WHERE user_id = $1 AND org_id = $2',
      [userId, orgId]
    );
    if (memberCheck.rows.length === 0) {
      res.status(403).json({ success: false, error: 'Access denied to this organization' });
      return;
    }

    let queryText = `
      SELECT v.*, 
             u.name as created_by_name,
             c.title as content_title
      FROM videos v
      LEFT JOIN users u ON v.created_by = u.id
      LEFT JOIN contents c ON v.content_id = c.id
      WHERE v.org_id = $1
    `;
    const params: any[] = [orgId];
    let paramIndex = 2;

    if (status) {
      queryText += ` AND v.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    queryText += ' ORDER BY v.created_at DESC';

    const result = await query(queryText, params);

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/videos - Crear nuevo video
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { content_id, title, storage_key, thumbnail_url, duration_seconds, metadata } = req.body;
    const userId = req.user!.id;

    if (!title || !storage_key) {
      res.status(400).json({ success: false, error: 'Title and storage_key are required' });
      return;
    }

    const userOrg = await query(
      'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (userOrg.rows.length === 0) {
      res.status(400).json({ success: false, error: 'User not associated with any organization' });
      return;
    }
    const orgId = userOrg.rows[0].org_id;

    const memberCheck = await query(
      'SELECT org_role FROM org_members WHERE user_id = $1 AND org_id = $2',
      [userId, orgId]
    );
    if (memberCheck.rows.length === 0 || !['admin', 'owner'].includes(memberCheck.rows[0].org_role)) {
      res.status(403).json({ success: false, error: 'Only admins can create videos' });
      return;
    }

    if (content_id) {
      const contentCheck = await query(
        `SELECT c.id FROM contents c
         JOIN modules m ON c.module_id = m.id
         JOIN programs p ON m.program_id = p.id
         WHERE c.id = $1 AND p.org_id = $2`,
        [content_id, orgId]
      );
      if (contentCheck.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Content not found or does not belong to your organization' });
        return;
      }
    }

    const result = await query(
      `INSERT INTO videos (content_id, org_id, title, storage_key, thumbnail_url, duration_seconds, metadata, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing')
       RETURNING *`,
      [content_id, orgId, title, storage_key, thumbnail_url, duration_seconds, metadata || {}, userId]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
  }
});


// PUT /api/videos/:id - Actualizar video (renombrar, thumbnail)
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, thumbnail_url } = req.body;
    const userId = req.user!.id;

    // Verificar que el usuario tiene acceso al video
    const videoCheck = await query(
      "SELECT v.* FROM videos v JOIN org_members om ON v.org_id = om.org_id WHERE v.id = $1 AND om.user_id = $2",
      [id, userId]
    );
    if (videoCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: "Video not found" });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (title) {
      updates.push("title = $" + paramIndex);
      params.push(title);
      paramIndex++;
    }
    if (thumbnail_url) {
      updates.push("thumbnail_url = $" + paramIndex);
      params.push(thumbnail_url);
      paramIndex++;
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: "No fields to update" });
      return;
    }

    params.push(id);
    const result = await query(
      "UPDATE videos SET " + updates.join(", ") + " WHERE id = $" + paramIndex + " RETURNING *",
      params
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// POST /api/videos/:id/thumbnail - Subir thumbnail de video
router.post('/:id/thumbnail', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    
    const videoCheck = await query(
      "SELECT v.* FROM videos v JOIN org_members om ON v.org_id = om.org_id WHERE v.id = $1 AND om.user_id = $2",
      [id, userId]
    );
    if (videoCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: "Video not found" });
      return;
    }
    
    const files = req.files as any;
    if (!files || !files.thumbnail) {
      res.status(400).json({ success: false, error: "No thumbnail file" });
      return;
    }
    
    const file = files.thumbnail;
    // Guardar thumbnail en storage o como base64
    const result = await uploadBuffer(file.data, "thumbnails/" + id + ".jpg", "image/jpeg");
    
    await query("UPDATE videos SET thumbnail_url = $1 WHERE id = $2", [result.url, id]);
    
    res.json({ success: true, data: { thumbnail_url: result.url } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});



// DELETE /api/videos/:id - Eliminar video
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const videoCheck = await query("SELECT v.* FROM videos v JOIN org_members om ON v.org_id = om.org_id WHERE v.id = $1 AND om.user_id = $2", [id, userId]);
    if (videoCheck.rows.length === 0) return res.status(404).json({ success: false, error: "Video not found" });
    await query("DELETE FROM videos WHERE id = $1", [id]);
    res.json({ success: true, message: "Video deleted" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

// POST /api/videos/:id/generate-thumbnail - Generar thumbnail con ffmpeg
router.post("/:id/generate-thumbnail", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const videoCheck = await query("SELECT v.* FROM videos v JOIN org_members om ON v.org_id = om.org_id WHERE v.id = $1 AND om.user_id = $2", [id, userId]);
    if (videoCheck.rows.length === 0) return res.status(404).json({ success: false, error: "Video not found" });
    
    const video = videoCheck.rows[0];
    const key = video.storage_key;
    if (!key) return res.status(400).json({ success: false, error: "No storage key" });
    
    const fileBuffer = await getFileBuffer(key);
    const tmpVideo = "/tmp/thumb-video-" + id + ".webm";
    const tmpImage = "/tmp/thumb-" + id + ".jpg";
    fs.writeFileSync(tmpVideo, fileBuffer);
    
    execSync("ffmpeg -i " + tmpVideo + " -ss 00:00:01 -vframes 1 -q:v 2 " + tmpImage + " 2>/dev/null");
    
    const thumbBuffer = fs.readFileSync(tmpImage);
    const result = await uploadBuffer(thumbBuffer, "thumbnails/" + id + ".jpg", "image/jpeg");
    
    await query("UPDATE videos SET thumbnail_url = $1 WHERE id = $2", [result.url, id]);
    
    fs.unlinkSync(tmpVideo);
    fs.unlinkSync(tmpImage);
    
    res.json({ success: true, data: { thumbnail_url: result.url } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
