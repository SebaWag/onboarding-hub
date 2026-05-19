import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

// GET /api/analytics/overview - Métricas generales de la plataforma
router.get('/overview', authenticate, async (req: AuthRequest, res: Response) => {
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
        data: {
          total_users: 0,
          active_users: 0,
          active_programs: 0,
          total_videos: 0,
          total_views: 0,
          flows_in_progress: 0,
          flows_completed: 0,
        }
      });
    }

    // Total usuarios en org
    const totalUsers = await query(
      'SELECT COUNT(*) as count FROM org_members WHERE org_id = $1',
      [orgId]
    );

    // Usuarios activos (login en últimos 7 días)
    const activeUsers = await query(
      `SELECT COUNT(DISTINCT u.id) as count 
       FROM users u
       JOIN org_members om ON u.id = om.user_id
       WHERE om.org_id = $1 AND u.last_login > NOW() - INTERVAL '7 days'`,
      [orgId]
    );

    // Programas activos
    const activePrograms = await query(
      'SELECT COUNT(*) as count FROM programs WHERE org_id = $1 AND is_active = true',
      [orgId]
    );

    // Videos listos (no contamos views porque no existe la columna)
    const totalVideos = await query(
      'SELECT COUNT(*) as count FROM videos WHERE org_id = $1 AND status = $2',
      [orgId, 'ready']
    );

    // Para total_views usamos count de videos como proxy (no hay view_count)
    const totalViews = totalVideos;

    // Flujos en progreso
    const flowsInProgress = await query(
      `SELECT COUNT(*) as count FROM user_flow_progress ufp
       JOIN onboarding_flows f ON ufp.flow_id = f.id
       WHERE f.program_id IN (SELECT id FROM programs WHERE org_id = $1)
       AND ufp.status = 'in_progress'`,
      [orgId]
    );

    // Flujos completados
    const flowsCompleted = await query(
      `SELECT COUNT(*) as count FROM user_flow_progress ufp
       JOIN onboarding_flows f ON ufp.flow_id = f.id
       WHERE f.program_id IN (SELECT id FROM programs WHERE org_id = $1)
       AND ufp.status = 'completed'`,
      [orgId]
    );

    res.json({
      success: true,
      data: {
        total_users: parseInt(totalUsers.rows[0].count),
        active_users: parseInt(activeUsers.rows[0].count),
        active_programs: parseInt(activePrograms.rows[0].count),
        total_videos: parseInt(totalVideos.rows[0].count),
        total_views: parseInt(totalVideos.rows[0].count), // Proxy: count de videos
        flows_in_progress: parseInt(flowsInProgress.rows[0].count),
        flows_completed: parseInt(flowsCompleted.rows[0].count),
      }
    });
  } catch (err: any) {
    console.error('Analytics overview error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/videos - Métricas de videos
router.get('/videos', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const userOrg = await query(
      'SELECT org_id FROM org_members WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const orgId = userOrg.rows[0]?.org_id;

    if (!orgId) {
      return res.json({ success: true, data: { top_videos: [], by_module: [] } });
    }

    // Top videos (sin view_count, ordenamos por created_at)
    const topVideos = await query(
      `SELECT v.id, v.title, v.thumbnail_url, v.duration_seconds, v.created_at,
              v.status, v.description,
              u.name as creator_name
       FROM videos v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.org_id = $1 AND v.status = 'ready'
       ORDER BY v.created_at DESC
       LIMIT 10`,
      [orgId]
    );

    res.json({
      success: true,
      data: {
        top_videos: topVideos.rows,
        by_module: []
      }
    });
  } catch (err: any) {
    console.error('Analytics videos error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/weekly - Actividad semanal
router.get('/weekly', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const weeklyData = await query(
      `SELECT 
         TO_CHAR(d.day, 'Dy') as day,
         0 as views,
         COALESCE(q.questions, 0) as questions
       FROM (
         SELECT CURRENT_DATE - INTERVAL '6 days' as day UNION ALL
         SELECT CURRENT_DATE - INTERVAL '5 days' UNION ALL
         SELECT CURRENT_DATE - INTERVAL '4 days' UNION ALL
         SELECT CURRENT_DATE - INTERVAL '3 days' UNION ALL
         SELECT CURRENT_DATE - INTERVAL '2 days' UNION ALL
         SELECT CURRENT_DATE - INTERVAL '1 day' UNION ALL
         SELECT CURRENT_DATE
       ) d(day)
       LEFT JOIN LATERAL (
         SELECT COUNT(*) as questions
         FROM chat_messages cm
         WHERE DATE(cm.created_at) = d.day
         AND cm.role = 'user'
       ) q ON true
       ORDER BY d.day`,
      []
    );

    res.json({ success: true, data: weeklyData.rows });
  } catch (err: any) {
    console.error('Analytics weekly error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
