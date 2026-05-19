import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

// Helper function
function timeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'Hace menos de un minuto';
  if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 604800) return `Hace ${Math.floor(seconds / 86400)} días`;
  return `Hace ${Math.floor(seconds / 604800)} semanas`;
}

// GET /api/users - Listar usuarios de la organización
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { search, role, department, status } = req.query;

    const userOrg = await query(
      'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const orgId = userOrg.rows[0]?.org_id;
    
    if (!orgId) {
      return res.json({ success: true, data: [] });
    }

    let sql = `
      SELECT u.id, u.email, u.name, u.role, u.department, u.position, 
             u.avatar_url, u.hire_date, u.last_login, u.is_active,
             om.org_role,
             o.name as org_name
      FROM users u
      JOIN org_members om ON u.id = om.user_id
      LEFT JOIN organizations o ON om.org_id = o.id
      WHERE om.org_id = $1
    `;
    const params: any[] = [orgId];
    let paramIndex = 2;

    if (search) {
      sql += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      sql += ` AND om.org_role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (department) {
      sql += ` AND u.department = $${paramIndex}`;
      params.push(department);
      paramIndex++;
    }

    if (status === 'active') {
      sql += ` AND u.is_active = true AND u.last_login > NOW() - INTERVAL '30 days'`;
    } else if (status === 'inactive') {
      sql += ` AND (u.is_active = false OR u.last_login < NOW() - INTERVAL '30 days')`;
    }

    sql += ' ORDER BY u.name';

    const result = await query(sql, params);

    // Agregar métricas (sin queries separadas para evitar errores)
    const usersWithMetrics = result.rows.map((user: any) => ({
      ...user,
      videos: 0,
      questions: 0,
      last_active: user.last_login ? timeAgo(user.last_login) : 'Nunca',
    }));

    res.json({ success: true, data: usersWithMetrics });
  } catch (err: any) {
    console.error('Users list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users - Crear usuario (admin only)
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, department, position, org_role, org_id } = req.body;
    const currentUserId = req.user!.id;

    let targetOrgId = org_id;
    if (!targetOrgId) {
      const userOrg = await query(
        'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
        [currentUserId]
      );
      targetOrgId = userOrg.rows[0]?.org_id;
    }

    if (!targetOrgId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const memberCheck = await query(
      'SELECT org_role FROM org_members WHERE user_id = $1 AND org_id = $2',
      [currentUserId, targetOrgId]
    );
    if (memberCheck.rows.length === 0 || !['admin', 'owner'].includes(memberCheck.rows[0].org_role)) {
      return res.status(403).json({ success: false, error: 'Only admins can create users' });
    }

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, error: 'Email, password and name are required' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Email already exists' });
    }

    // Hash password usando bcryptjs
    const bcrypt = require('bcryptjs');
    const password_hash = await bcrypt.hash(password, 12);
    
    const result = await query(
      `INSERT INTO users (email, password_hash, name, department, position, role)
       VALUES ($1, $2, $3, $4, $5, 'viewer')
       RETURNING id, email, name, role, department, position`,
      [email, password_hash, name, department, position]
    );

    const newUser = result.rows[0];

    await query(
      `INSERT INTO org_members (user_id, org_id, org_role)
       VALUES ($1, $2, $3)`,
      [newUser.id, targetOrgId, org_role || 'viewer']
    );

    res.status(201).json({ success: true, data: newUser });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/stats/summary - Estadísticas de usuarios
router.get('/stats/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const userOrg = await query(
      'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const orgId = userOrg.rows[0]?.org_id;

    if (!orgId) {
      return res.json({
        success: true,
        data: { total: 0, active: 0, admins: 0, editors: 0, by_department: [] }
      });
    }

    const total = await query(
      'SELECT COUNT(*) as count FROM org_members WHERE org_id = $1',
      [orgId]
    );

    const active = await query(
      `SELECT COUNT(*) as count FROM users u
       JOIN org_members om ON u.id = om.user_id
       WHERE om.org_id = $1 AND u.is_active = true AND u.last_login > NOW() - INTERVAL '30 days'`,
      [orgId]
    );

    const admins = await query(
      `SELECT COUNT(*) as count FROM org_members WHERE org_id = $1 AND org_role IN ('admin', 'owner')`,
      [orgId]
    );

    const editors = await query(
      `SELECT COUNT(*) as count FROM org_members WHERE org_id = $1 AND org_role = 'editor'`,
      [orgId]
    );

    const byDepartment = await query(
      `SELECT u.department, COUNT(*) as count
       FROM users u
       JOIN org_members om ON u.id = om.user_id
       WHERE om.org_id = $1 AND u.department IS NOT NULL
       GROUP BY u.department`,
      [orgId]
    );

    res.json({
      success: true,
      data: {
        total: parseInt(total.rows[0].count),
        active: parseInt(active.rows[0].count),
        admins: parseInt(admins.rows[0].count),
        editors: parseInt(editors.rows[0].count),
        by_department: byDepartment.rows
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
