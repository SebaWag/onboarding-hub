import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

// GET /api/programs - Listar programas de la organización
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { is_active } = req.query;
    const userId = req.user!.id;

    const memberCheck = await query(
      'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    
    if (memberCheck.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    const orgId = memberCheck.rows[0].org_id;

    let queryText = `
      SELECT p.*, 
             u.name as created_by_name,
             (SELECT COUNT(*) FROM modules m WHERE m.program_id = p.id) as module_count,
             0 as enrolled_users
      FROM programs p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.org_id = $1
    `;
    const params: any[] = [orgId];

    if (is_active !== undefined) {
      queryText += ` AND p.is_active = $2`;
      params.push(is_active === 'true');
    }

    queryText += ' ORDER BY p.created_at DESC';

    const result = await query(queryText, params);

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('Programs list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/programs - Crear nuevo programa
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, is_active, org_id } = req.body;
    const userId = req.user!.id;

    if (!title) {
      res.status(400).json({ success: false, error: 'Title is required' });
      return;
    }

    let orgId = org_id;
    if (!orgId) {
      const userOrg = await query(
        'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      if (userOrg.rows.length === 0) {
        res.status(400).json({ success: false, error: 'User not in any organization' });
        return;
      }
      orgId = userOrg.rows[0].org_id;
    }

    const result = await query(
      `INSERT INTO programs (org_id, title, description, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [orgId, title, description || null, is_active !== false, userId]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    console.error('Create program error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/programs/:id - Obtener programa por ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT p.*, u.name as created_by_name
       FROM programs p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Program not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/programs/:id - Actualizar programa
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, is_active } = req.body;

    const result = await query(
      `UPDATE programs SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [title, description, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Program not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/programs/:id - Eliminar programa
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM programs WHERE id = $1', [id]);
    res.json({ success: true, message: 'Program deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
