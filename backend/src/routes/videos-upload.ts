import { Router, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { query } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { uploadBuffer, getPublicUrl } from '../services/storage';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    console.log('[UPLOAD] Recibido archivo:', file.originalname, 'mimetype:', file.mimetype);
    const allowedMimes = ['video/webm', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/mp4', 'video/quicktime'];
    const isAllowed = allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('video/');
    const isWebmFile = file.originalname.endsWith('.webm') || file.originalname.endsWith('.mp4');
    const shouldAllow = isAllowed || isWebmFile;
    console.log('[UPLOAD] MIME permitido:', shouldAllow);
    if (shouldAllow) {
      cb(null, true);
    } else {
      console.log('[UPLOAD] RECHAZADO - mimetype:', file.mimetype);
      cb(new Error('Tipo de archivo no permitido: ' + file.mimetype));
    }
  },
});

// POST /api/videos/upload - Upload video file
router.post('/upload', authenticate, upload.single('video'), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description } = req.body;
    const file = req.file;
    const userId = req.user!.id;

    if (!file) {
      res.status(400).json({ success: false, error: 'No se proporciono archivo de video' });
      return;
    }

    if (!title) {
      res.status(400).json({ success: false, error: 'El titulo es requerido' });
      return;
    }

    const userOrg = await query(
      'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (userOrg.rows.length === 0) {
      res.status(400).json({ success: false, error: 'Usuario no asociado a ninguna organizacion' });
      return;
    }
    const orgId = userOrg.rows[0].org_id;

    const fileExtension = file.originalname.endsWith('.webm') ? 'webm' : 'mp4';
    const storageKey = `videos/${orgId}/${Date.now()}.${fileExtension}`;

    // Upload to SeaweedFS
    console.log('[UPLOAD] Subiendo a SeaweedFS:', storageKey, '(' + file.size + ' bytes)');
    const uploadResult = await uploadBuffer(file.buffer, storageKey, file.mimetype);
    console.log('[UPLOAD] Subido exitosamente:', uploadResult.url);

    const metadata = {
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      storage_key: storageKey,
      public_url: uploadResult.url,
    };

    const result = await query(
      `INSERT INTO videos (org_id, title, description, storage_key, duration_seconds, metadata, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready')
       RETURNING *`,
      [orgId, title, description, storageKey, Math.floor(file.size / 100000), JSON.stringify(metadata), userId]
    );

    const video = result.rows[0];

    res.status(201).json({
      success: true,
      data: { video, upload_url: uploadResult.url },
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/videos/:id/stream - Get video stream URL
router.get('/:id/stream', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const videoResult = await query(
      `SELECT v.*, om.org_role
       FROM videos v
       LEFT JOIN org_members om ON v.org_id = om.org_id AND om.user_id = $1
       WHERE v.id = $2`,
      [userId, id]
    );

    if (videoResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video no encontrado' });
      return;
    }

    const video = videoResult.rows[0];
    const streamUrl = getPublicUrl(video.storage_key);

    res.json({
      success: true,
      data: {
        stream_url: streamUrl,
        duration: video.duration_seconds,
        transcript: video.transcript,
        chapters: video.metadata?.chapters || [],
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/videos/:id/file - Serve video file (proxy through backend)
router.get('/:id/file', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const videoResult = await query(
      `SELECT * FROM videos WHERE id = $1`,
      [id]
    );

    if (videoResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video no encontrado' });
      return;
    }

    const video = videoResult.rows[0];
    const publicUrl = getPublicUrl(video.storage_key);
    
    // Redirect to SeaweedFS public URL
    res.redirect(publicUrl);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/videos/:id/share - Create share link
router.post('/:id/share', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { is_public, expires_at, password, allowed_emails } = req.body;
    const userId = req.user!.id;

    const videoCheck = await query(
      `SELECT v.*, om.org_role
       FROM videos v
       LEFT JOIN org_members om ON v.org_id = om.org_id AND om.user_id = $1
       WHERE v.id = $2`,
      [userId, id]
    );

    if (videoCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video no encontrado' });
      return;
    }

    const video = videoCheck.rows[0];
    if (video.created_by !== userId && !['admin', 'owner'].includes(videoCheck.rows[0].org_role)) {
      res.status(403).json({ success: false, error: 'No tienes permisos para compartir este video' });
      return;
    }

    const shareToken = uuidv4().replace(/-/g, '').substring(0, 16);

    const result = await query(
      `INSERT INTO video_shares (video_id, share_token, is_public, expires_at, password_hash, allowed_emails, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, shareToken, is_public !== false, expires_at || null, password || null, allowed_emails ? JSON.stringify(allowed_emails) : null, userId]
    );

    const share = result.rows[0];

    res.status(201).json({
      success: true,
      data: {
        share_id: share.id,
        share_token: share.share_token,
        share_url: `${process.env.FRONTEND_URL || 'http://localhost:8090'}/share/${shareToken}`,
        is_public: share.is_public,
        expires_at: share.expires_at,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/videos/:id/shares - Get all share links for a video
router.get('/:id/shares', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const videoCheck = await query(
      `SELECT v.id FROM videos v
       LEFT JOIN org_members om ON v.org_id = om.org_id AND om.user_id = $1
       WHERE v.id = $2 AND om.user_id IS NOT NULL`,
      [userId, id]
    );

    if (videoCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Video no encontrado' });
      return;
    }

    const shares = await query(
      `SELECT id, share_token, is_public, expires_at, allowed_emails, created_at,
              (SELECT COUNT(*) FROM video_share_views WHERE share_id = video_shares.id) as view_count
       FROM video_shares
       WHERE video_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: shares.rows.map(s => ({
        ...s,
        share_url: `${process.env.FRONTEND_URL || 'http://localhost:8090'}/share/${s.share_token}`,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/share/:token - Public endpoint to access shared video
router.get('/share/:token', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.query;

    const shareResult = await query(
      `SELECT vs.*, v.title, v.description, v.storage_key, v.duration_seconds, v.transcript, v.metadata, v.thumbnail_url
       FROM video_shares vs
       JOIN videos v ON vs.video_id = v.id
       WHERE vs.share_token = $1`,
      [token]
    );

    if (shareResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Link no encontrado o invalido' });
      return;
    }

    const share = shareResult.rows[0];

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      res.status(410).json({ success: false, error: 'Este link ha expirado' });
      return;
    }

    if (share.password_hash && share.password_hash !== password) {
      res.status(401).json({ success: false, error: 'Contrasena requerida', requires_password: true });
      return;
    }

    await query(
      `INSERT INTO video_share_views (share_id, ip_address, user_agent)
       VALUES ($1, $2, $3)`,
      [share.id, req.ip, req.headers['user-agent']]
    );

    const streamUrl = getPublicUrl(share.storage_key);

    res.json({
      success: true,
      data: {
        video: {
          id: share.video_id,
          title: share.title,
          description: share.description,
          duration: share.duration_seconds,
          transcript: share.transcript,
          thumbnail_url: share.thumbnail_url,
          stream_url: streamUrl,
        },
        share: { is_public: share.is_public },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// POST /api/videos/:id/chat - Chat with video using AI
router.post("/:id/chat", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { message, current_timestamp } = req.body;
    const userId = req.user!.id;

    if (!message) {
      res.status(400).json({ success: false, error: "Message is required" });
      return;
    }

    const videoResult = await query(
      `SELECT v.*, om.org_id
       FROM videos v
       LEFT JOIN org_members om ON v.org_id = om.org_id AND om.user_id = $1
       WHERE v.id = $2 AND om.user_id IS NOT NULL`,
      [userId, id]
    );

    if (videoResult.rows.length === 0) {
      res.status(404).json({ success: false, error: "Video no encontrado" });
      return;
    }

    const video = videoResult.rows[0];

    const tsContext = current_timestamp
      ? `\nEl usuario esta viendo el video aproximadamente en el timestamp: ${current_timestamp}`
      : "";

    const transcriptText = video.transcript
      ? video.transcript
      : "No hay transcripcion disponible para este video.";

    const response = await fetch("https://api.xiaomimimo.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MIMO_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mimo-v2-omni",
        messages: [
          {
            role: "system",
            content: `Eres un asistente experto en analizar videos tutoriales de onboarding corporativo.

TITULO DEL VIDEO: ${video.title}

TRANSCRIPCION DEL VIDEO:
${transcriptText}${tsContext}

INSTRUCCIONES:
- Responde SIEMPRE en espanol, de forma clara, amigable y util
- Usa la transcripcion del video para responder las preguntas del usuario
- Si la informacion esta en un momento especifico, indica el timestamp
- Si no encuentras la respuesta en la transcripcion, indicalo honestamente
- Se conciso pero completo en tus respuestas`,
          },
          { role: "user", content: message },
        ],
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("MiMo API error:", response.status, errorText);
      res.status(500).json({ success: false, error: `Error del asistente: ${response.status}` });
      return;
    }

    const aiResponse: any = await response.json();
    const aiMessage = aiResponse.choices?.[0]?.message?.content || "No pude procesar tu pregunta.";

    res.json({
      success: true,
      data: {
        response: aiMessage,
        video_ref: aiMessage.match(/(\d+:\d+)/)?.[1] || null,
      },
    });
  } catch (err: any) {
    console.error("Chat error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


export default router;
