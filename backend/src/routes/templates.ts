import { Router, Response } from 'express';
import multer from 'multer';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { uploadBuffer, deleteFile, getPresignedUrl } from '../services/storage';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// CATEGORIES
router.get('/categories', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT c.*, COUNT(ct.id) as template_count FROM template_categories c LEFT JOIN corporate_templates ct ON c.id = ct.category_id GROUP BY c.id ORDER BY c.sort_order'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener categorias' });
  }
});

router.post('/categories', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, icon, parent_id, sort_order } = req.body;
    const result = await query(
      'INSERT INTO template_categories (name, description, icon, parent_id, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description, icon, parent_id, sort_order || 0]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al crear categoria' });
  }
});

// TEMPLATES
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { category_id, status, file_type, search, tags } = req.query;
    let sql = 'SELECT t.*, c.name as category_name, u.name as creator_name, a.name as approver_name FROM corporate_templates t LEFT JOIN template_categories c ON t.category_id = c.id LEFT JOIN users u ON t.created_by = u.id LEFT JOIN users a ON t.approved_by = a.id WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (category_id) { sql += ' AND t.category_id = $' + paramIndex++; params.push(category_id); }
    if (status) { sql += ' AND t.status = $' + paramIndex++; params.push(status); }
    if (file_type) { sql += ' AND t.file_type = $' + paramIndex++; params.push(file_type); }
    if (search) { sql += ' AND (t.name ILIKE $' + paramIndex + ' OR t.description ILIKE $' + paramIndex + ')'; params.push('%' + search + '%'); paramIndex++; }
    if (tags) { const tagArray = (tags as string).split(','); sql += ' AND t.tags && $' + paramIndex++; params.push(tagArray); }

    sql += ' ORDER BY t.updated_at DESC';
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener templates' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT t.*, c.name as category_name, u.name as creator_name FROM corporate_templates t LEFT JOIN template_categories c ON t.category_id = c.id LEFT JOIN users u ON t.created_by = u.id WHERE t.id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Template no encontrado' });
    const versionsResult = await query('SELECT v.*, u.name as creator_name FROM template_versions v LEFT JOIN users u ON v.created_by = u.id WHERE v.template_id = $1 ORDER BY v.version_number DESC', [id]);
    const template = result.rows[0];
    template.versions = versionsResult.rows;
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener template' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, category_id, file_type, content, tags } = req.body;
    const result = await query('INSERT INTO corporate_templates (name, description, category_id, file_type, content, tags, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [name, description, category_id, file_type, content, tags || [], req.user!.id]);
    await query('INSERT INTO template_versions (template_id, version_number, content, change_summary, created_by) VALUES ($1, 1, $2, $3, $4)', [result.rows[0].id, content, 'Version inicial', req.user!.id]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al crear template' });
  }
});

router.post('/:id/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: 'No se proporciono archivo' });
    const templateResult = await query('SELECT * FROM corporate_templates WHERE id = $1', [id]);
    if (templateResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Template no encontrado' });
    const fileName = 'templates/' + id + '/' + uuidv4() + '-' + file.originalname;
    await uploadBuffer(file.buffer, fileName, file.mimetype);
    await query('UPDATE corporate_templates SET minio_path = $1, updated_at = NOW() WHERE id = $2', [fileName, id]);
    const versionResult = await query('INSERT INTO template_versions (template_id, version_number, minio_path, created_by) VALUES ($1, (SELECT COALESCE(MAX(version_number), 0) + 1 FROM template_versions WHERE template_id = $1), $2, $3) RETURNING *', [id, fileName, req.user!.id]);
    await query('UPDATE corporate_templates SET version = version + 1, updated_at = NOW() WHERE id = $1', [id]);
    res.json({ success: true, data: { path: fileName, version: versionResult.rows[0] } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al subir archivo' });
  }
});

router.get('/:id/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { version } = req.query;
    let storagePath: string;
    if (version) {
      const versionResult = await query('SELECT minio_path FROM template_versions WHERE template_id = $1 AND version_number = $2', [id, version]);
      if (versionResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Version no encontrada' });
      storagePath = versionResult.rows[0].minio_path;
    } else {
      const templateResult = await query('SELECT minio_path FROM corporate_templates WHERE id = $1', [id]);
      if (templateResult.rows.length === 0 || !templateResult.rows[0].minio_path) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
      storagePath = templateResult.rows[0].minio_path;
    }
    const { url } = await getPresignedUrl(storagePath, 3600);
    res.json({ success: true, data: { url } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al generar URL de descarga' });
  }
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, category_id, content, tags, status } = req.body;
    const result = await query('UPDATE corporate_templates SET name = COALESCE($1, name), description = COALESCE($2, description), category_id = COALESCE($3, category_id), content = COALESCE($4, content), tags = COALESCE($5, tags), status = COALESCE($6, status), updated_at = NOW() WHERE id = $7 RETURNING *', [name, description, category_id, content, tags, status, id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Template no encontrado' });
    if (content) await query('INSERT INTO template_versions (template_id, version_number, content, change_summary, created_by) VALUES ($1, (SELECT COALESCE(MAX(version_number), 0) + 1 FROM template_versions WHERE template_id = $1), $2, $3, $4)', [id, content, 'Actualizacion de contenido', req.user!.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al actualizar template' });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const templateResult = await query('SELECT minio_path FROM corporate_templates WHERE id = $1', [id]);
    const versionsResult = await query('SELECT minio_path FROM template_versions WHERE template_id = $1', [id]);
    const pathsToDelete = [templateResult.rows[0]?.minio_path, ...versionsResult.rows.map((v: any) => v.minio_path)].filter(Boolean);
    for (const path of pathsToDelete) { try { await deleteFile(path); } catch (e) { console.error('Error deleting from storage:', e); } }
    await query('DELETE FROM corporate_templates WHERE id = $1', [id]);
    res.json({ success: true, message: 'Template eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al eliminar template' });
  }
});

// APPROVALS
router.post('/:id/request-approval', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { approver_id, comments } = req.body;
    await query("UPDATE corporate_templates SET status = 'review', updated_at = NOW() WHERE id = $1", [id]);
    const result = await query('INSERT INTO template_approvals (template_id, requested_by, approver_id, comments) VALUES ($1, $2, $3, $4) RETURNING *', [id, req.user!.id, approver_id, comments]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al solicitar aprobacion' });
  }
});

router.put('/approvals/:approvalId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { approvalId } = req.params;
    const { status, comments } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Estado invalido' });
    const approvalResult = await query('SELECT * FROM template_approvals WHERE id = $1 AND approver_id = $2', [approvalId, req.user!.id]);
    if (approvalResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Aprobacion no encontrada' });
    const approval = approvalResult.rows[0];
    await query('UPDATE template_approvals SET status = $1, comments = $2, approved_at = NOW() WHERE id = $3', [status, comments, approvalId]);
    const templateStatus = status === 'approved' ? 'approved' : 'draft';
    await query('UPDATE corporate_templates SET status = $1, approved_by = $2, approved_at = $3, updated_at = NOW() WHERE id = $4', [templateStatus, status === 'approved' ? req.user!.id : null, status === 'approved' ? new Date() : null, approval.template_id]);
    res.json({ success: true, message: status === 'approved' ? 'Template aprobado' : 'Template rechazado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al procesar aprobacion' });
  }
});

router.get('/approvals/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT a.*, t.name as template_name, t.file_type, u.name as requester_name FROM template_approvals a JOIN corporate_templates t ON a.template_id = t.id JOIN users u ON a.requested_by = u.id WHERE a.approver_id = $1 AND a.status = $2 ORDER BY a.created_at DESC', [req.user!.id, 'pending']);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener aprobaciones' });
  }
});

// METRICS
router.get('/metrics/overview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const total = await query('SELECT COUNT(*) as total FROM corporate_templates');
    const byStatus = await query('SELECT status, COUNT(*) as count FROM corporate_templates GROUP BY status');
    const byType = await query('SELECT file_type, COUNT(*) as count FROM corporate_templates GROUP BY file_type');
    const byCategory = await query('SELECT c.name, COUNT(t.id) as count FROM template_categories c LEFT JOIN corporate_templates t ON c.id = t.category_id GROUP BY c.id, c.name ORDER BY count DESC');
    const recentActivity = await query('SELECT t.name, t.updated_at, u.name as user_name FROM corporate_templates t JOIN users u ON t.created_by = u.id ORDER BY t.updated_at DESC LIMIT 5');
    res.json({ success: true, data: { total: parseInt(total.rows[0].total), by_status: byStatus.rows, by_type: byType.rows, by_category: byCategory.rows, recent_activity: recentActivity.rows } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener metricas' });
  }
});

export default router;
