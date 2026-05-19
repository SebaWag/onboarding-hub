import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

// GET /api/modules/program/:programId - Listar módulos con contenidos
router.get('/program/:programId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { programId } = req.params;

    // Obtener módulos
    const modulesResult = await query(
      `SELECT m.*,
              (SELECT COUNT(*) FROM contents c WHERE c.module_id = m.id) as content_count
       FROM modules m
       WHERE m.program_id = $1
       ORDER BY m.order_index ASC`,
      [programId]
    );

    // Para cada módulo, obtener contenidos y videos relacionados
    const modules = await Promise.all(modulesResult.rows.map(async (mod: any) => {
      // Obtener contenidos
      const contentsResult = await query(
        `SELECT c.*, v.id as video_id, v.title as video_title, v.duration_seconds, v.status as video_status
         FROM contents c
         LEFT JOIN videos v ON v.content_id = c.id
         WHERE c.module_id = $1
         ORDER BY c.order_index ASC`,
        [mod.id]
      );
      return { ...mod, contents: contentsResult.rows };
    }));

    res.json({ success: true, data: modules });
  } catch (err: any) {
    console.error('Modules fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/modules - Crear módulo
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { program_id, title, description } = req.body;

    if (!program_id || !title) {
      return res.status(400).json({ success: false, error: 'program_id and title are required' });
    }

    const maxOrder = await query(
      'SELECT COALESCE(MAX(order_index), 0) + 1 as next_order FROM modules WHERE program_id = $1',
      [program_id]
    );
    const nextOrder = maxOrder.rows[0].next_order;

    const result = await query(
      `INSERT INTO modules (program_id, title, description, order_index)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [program_id, title, description || null, nextOrder]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    console.error('Create module error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/modules/:id
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, order_index } = req.body;

    const result = await query(
      `UPDATE modules SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         order_index = COALESCE($3, order_index)
       WHERE id = $4
       RETURNING *`,
      [title, description, order_index, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/modules/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM modules WHERE id = $1', [id]);
    res.json({ success: true, message: 'Module deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
