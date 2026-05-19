import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { query } from '../db';
import { chatWithContext, analyzeVideo, analyzeImage } from '../services/ai/mimo-provider';

const router = Router();

// POST /api/chat - Chat con IA contextual
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { message, conversation_id, module_id } = req.body;
    const userId = req.user!.id;

    if (!message) {
      res.status(400).json({ success: false, error: 'Message is required' });
      return;
    }

    // Obtener o crear conversación
    let convId = conversation_id;
    if (!convId) {
      const conv = await query(
        `INSERT INTO chat_conversations (user_id, title, context)
         VALUES ($1, $2, 'general')
         RETURNING id`,
        [userId, message.substring(0, 100)]
      );
      convId = conv.rows[0].id;
    }

    // Guardar mensaje del usuario
    await query(
      'INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [convId, 'user', message]
    );

    // Buscar contexto relevante en knowledge_base
    const kbResults = await query(
      `SELECT title, content, source_type FROM knowledge_base
       WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = $1)
       AND is_active = true
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    const context = kbResults.rows
      .map((r: any) => `[${r.source_type}] ${r.title}: ${r.content}`)
      .join('\n\n');

    // Obtener historial de conversación
    const history = await query(
      `SELECT role, content FROM chat_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 20`,
      [convId]
    );

    const conversationHistory = history.rows.slice(0, -1).map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Llamar a MiMo
    const aiResponse = await chatWithContext(message, context, conversationHistory);

    // Guardar respuesta
    await query(
      'INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [convId, 'assistant', aiResponse.content]
    );

    res.json({
      success: true,
      data: {
        conversation_id: convId,
        message: aiResponse.content,
        usage: aiResponse.usage,
      },
    });
  } catch (err: any) {
    console.error('Chat error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/chat/video - Analizar video tutorial
router.post('/video', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { video_url, question } = req.body;

    if (!video_url || !question) {
      res.status(400).json({ success: false, error: 'video_url and question are required' });
      return;
    }

    const systemPrompt = `Eres un asistente especializado en analizar videos tutoriales de onboarding corporativo.
Cuando analices un video:
- Describe los pasos que se muestran
- Identifica las secciones clave con timestamps aproximados
- Responde preguntas específicas sobre el contenido visual y auditivo
- Si se muestra una interfaz de software, describe los elementos y acciones`;

    const response = await analyzeVideo(video_url, question, systemPrompt);

    res.json({
      success: true,
      data: { analysis: response },
    });
  } catch (err: any) {
    console.error('Video analysis error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/chat/image - Analizar imagen/screenshot
router.post('/image', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { image_url, question } = req.body;

    if (!image_url || !question) {
      res.status(400).json({ success: false, error: 'image_url and question are required' });
      return;
    }

    const response = await analyzeImage(image_url, question);

    res.json({
      success: true,
      data: { analysis: response },
    });
  } catch (err: any) {
    console.error('Image analysis error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/chat/conversations - Listar conversaciones
router.get('/conversations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT c.id, c.title, c.context, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) as message_count
       FROM chat_conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC
       LIMIT 50`,
      [req.user!.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/chat/conversations/:id/messages - Mensajes de una conversación
router.get('/conversations/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT id, role, content, sources, created_at
       FROM chat_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
