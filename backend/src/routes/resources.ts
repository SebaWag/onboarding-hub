import { Router, Response } from 'express';
import multer from 'multer';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { uploadBuffer, getFileBuffer, deleteFile } from '../services/storage';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

export const RESOURCE_CATEGORIES = [
  { id: 'documents', name: 'Documentos', icon: 'FileText', color: '#3b82f6', extensions: ['docx', 'pdf', 'doc'] },
  { id: 'spreadsheets', name: 'Hojas de Calculo', icon: 'Table', color: '#10b981', extensions: ['xlsx', 'xls', 'csv'] },
  { id: 'presentations', name: 'Presentaciones', icon: 'Presentation', color: '#f59e0b', extensions: ['pptx', 'ppt'] },
  { id: 'pdfs', name: 'PDFs', icon: 'FileArchive', color: '#ef4444', extensions: ['pdf'] },
  { id: 'images', name: 'Imagenes', icon: 'Image', color: '#8b5cf6', extensions: ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'] },
  { id: 'invoices', name: 'Facturas y Formularios', icon: 'Receipt', color: '#06b6d4', extensions: ['pdf', 'docx', 'xlsx'] },
  { id: 'multimedia', name: 'Multimedia', icon: 'Video', color: '#ec4899', extensions: ['mp4', 'webm', 'mov', 'avi'] },
];

// CATEGORIES
router.get('/categories', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT c.*, COUNT(r.id) as resource_count FROM resource_categories c LEFT JOIN corporate_resources r ON c.id = r.category_id GROUP BY c.id ORDER BY c.sort_order');
    if (result.rows.length === 0) {
      for (let i = 0; i < RESOURCE_CATEGORIES.length; i++) {
        const cat = RESOURCE_CATEGORIES[i];
        await query('INSERT INTO resource_categories (id, name, icon, color, extensions, sort_order) VALUES ($1, $2, $3, $4, $5, $6)', [cat.id, cat.name, cat.icon, cat.color, cat.extensions.join(','), i]);
      }
      const newResult = await query('SELECT c.*, COUNT(r.id) as resource_count FROM resource_categories c LEFT JOIN corporate_resources r ON c.id = r.category_id GROUP BY c.id ORDER BY c.sort_order');
      return res.json({ success: true, data: newResult.rows });
    }
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, error: 'Error al obtener categorias' });
  }
});

router.post('/categories', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, icon, color, extensions } = req.body;
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const sortOrder = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM resource_categories');
    const result = await query('INSERT INTO resource_categories (id, name, description, icon, color, extensions, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [id, name, description || '', icon || 'Folder', color || '#6b7280', extensions?.join(',') || '', sortOrder.rows[0].next]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al crear categoria' });
  }
});

// RESOURCES LIST
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { category_id, search, file_type, uploader_id } = req.query;
    let sql = 'SELECT r.*, c.name as category_name, c.icon as category_icon, c.color as category_color, u.name as uploader_name, u.email as uploader_email FROM corporate_resources r LEFT JOIN resource_categories c ON r.category_id = c.id LEFT JOIN users u ON r.uploaded_by = u.id WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (category_id) { sql += ' AND r.category_id = $' + paramIndex++; params.push(category_id); }
    if (search) { sql += ' AND (r.name ILIKE $' + paramIndex + ' OR r.description ILIKE $' + paramIndex + ' OR r.tags::text ILIKE $' + paramIndex + ')'; params.push('%' + search + '%'); paramIndex++; }
    if (file_type) { sql += ' AND r.file_type = $' + paramIndex++; params.push(file_type); }
    if (uploader_id) { sql += ' AND r.uploaded_by = $' + paramIndex++; params.push(uploader_id); }

    sql += ' ORDER BY r.created_at DESC';
    const result = await query(sql, params);
    const resources = result.rows.map(r => ({ ...r, preview_url: r.storage_path ? '/api/resources/' + r.id + '/preview' : null, download_url: r.storage_path ? '/api/resources/' + r.id + '/download' : null }));
    res.json({ success: true, data: resources });
  } catch (error) {
    console.error('Error fetching resources:', error);
    res.status(500).json({ success: false, error: 'Error al obtener recursos' });
  }
});

// GET RESOURCE
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT r.*, c.name as category_name, c.icon as category_icon, c.color as category_color, u.name as uploader_name, u.email as uploader_email FROM corporate_resources r LEFT JOIN resource_categories c ON r.category_id = c.id LEFT JOIN users u ON r.uploaded_by = u.id WHERE r.id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Recurso no encontrado' });
    const resource = result.rows[0];
    resource.preview_url = resource.storage_path ? '/api/resources/' + resource.id + '/preview' : null;
    resource.download_url = resource.storage_path ? '/api/resources/' + resource.id + '/download' : null;
    res.json({ success: true, data: resource });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener recurso' });
  }
});

// CREATE RESOURCE
router.post('/', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, category_id, tags } = req.body;
    const file = req.file;
    if (!category_id) return res.status(400).json({ success: false, error: 'La categoria es obligatoria' });
    const catCheck = await query('SELECT * FROM resource_categories WHERE id = $1', [category_id]);
    if (catCheck.rows.length === 0) return res.status(400).json({ success: false, error: 'Categoria no valida' });

    let storage_path = null;
    let file_type = null;
    let file_size = null;
    let mime_type = null;

    if (file) {
      const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
      file_type = ext.replace('.', '');
      file_size = file.size;
      mime_type = file.mimetype;
      const fileName = 'resources/' + category_id + '/' + uuidv4() + ext;
      await uploadBuffer(file.buffer, fileName, file.mimetype);
      storage_path = fileName;
    }

    const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : [];
    const result = await query('INSERT INTO corporate_resources (name, description, category_id, file_type, file_size, mime_type, storage_path, tags, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *', [name, description || '', category_id, file_type, file_size, mime_type, storage_path, tagsArray, req.user!.id]);
    const resource = result.rows[0];
    resource.uploader_name = req.user!.name;
    resource.category_name = catCheck.rows[0].name;
    resource.preview_url = storage_path ? '/api/resources/' + resource.id + '/preview' : null;
    resource.download_url = storage_path ? '/api/resources/' + resource.id + '/download' : null;
    res.status(201).json({ success: true, data: resource });
  } catch (error: any) {
    console.error('Error creating resource:', error);
    res.status(500).json({ success: false, error: error.message || 'Error al crear recurso' });
  }
});

// UPDATE RESOURCE
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, category_id, tags } = req.body;
    const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : null;
    const result = await query('UPDATE corporate_resources SET name = COALESCE($1, name), description = COALESCE($2, description), category_id = COALESCE($3, category_id), tags = COALESCE($4, tags), updated_at = NOW() WHERE id = $5 RETURNING *', [name, description, category_id, tagsArray, id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Recurso no encontrado' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al actualizar recurso' });
  }
});

// UPLOAD FILE
router.post('/:id/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: 'No se proporciono archivo' });
    const templateResult = await query('SELECT * FROM corporate_resources WHERE id = $1', [id]);
    if (templateResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Recurso no encontrado' });
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    const fileName = 'resources/' + templateResult.rows[0].category_id + '/' + uuidv4() + ext;
    await uploadBuffer(file.buffer, fileName, file.mimetype);
    await query('UPDATE corporate_resources SET storage_path = $1, file_type = $2, file_size = $3, mime_type = $4, updated_at = NOW() WHERE id = $5', [fileName, ext.replace('.', ''), file.size, file.mimetype, id]);
    res.json({ success: true, message: 'Archivo actualizado', path: fileName });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al subir archivo' });
  }
});

// PREVIEW
router.get('/:id/preview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT storage_path, mime_type, name, file_type FROM corporate_resources WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Recurso no encontrado' });
    const resource = result.rows[0];
    if (!resource.storage_path) return res.status(404).json({ success: false, error: 'El recurso no tiene archivo' });
    if (resource.mime_type?.startsWith('image/') || resource.mime_type === 'application/pdf') {
      try {
        const buffer = await getFileBuffer(resource.storage_path);
        res.setHeader('Content-Type', resource.mime_type);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Disposition', 'inline; filename="' + resource.name + '.' + resource.file_type + '"');
        return res.send(buffer);
      } catch (err) {
        console.error('Error reading file:', err);
        return res.status(500).json({ success: false, error: 'Error al leer archivo' });
      }
    }
    res.json({ success: true, data: { type: resource.mime_type, file_type: resource.file_type, name: resource.name, message: 'Este tipo de archivo no tiene preview disponible.' } });
  } catch (error) {
    console.error('Error in preview:', error);
    res.status(500).json({ success: false, error: 'Error al generar preview' });
  }
});

// DOWNLOAD
router.get('/:id/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT storage_path, mime_type, name, file_type FROM corporate_resources WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Recurso no encontrado' });
    const resource = result.rows[0];
    if (!resource.storage_path) return res.status(404).json({ success: false, error: 'El recurso no tiene archivo' });
    try {
      const buffer = await getFileBuffer(resource.storage_path);
      const filename = resource.name + '.' + resource.file_type;
      res.setHeader('Content-Type', resource.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.send(buffer);
    } catch (err) {
      console.error('Error reading file:', err);
      return res.status(500).json({ success: false, error: 'Error al leer archivo' });
    }
  } catch (error) {
    console.error('Error in download:', error);
    res.status(500).json({ success: false, error: 'Error al generar descarga' });
  }
});

// DELETE
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT storage_path FROM corporate_resources WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Recurso no encontrado' });
    if (result.rows[0].storage_path) {
      try { await deleteFile(result.rows[0].storage_path); } catch (e) { console.error('Error deleting from storage:', e); }
    }
    await query('DELETE FROM corporate_resources WHERE id = $1', [id]);
    res.json({ success: true, message: 'Recurso eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al eliminar recurso' });
  }
});

// STATS
router.get('/stats/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const total = await query('SELECT COUNT(*) as count FROM corporate_resources');
    const byCategory = await query('SELECT c.id, c.name, c.icon, c.color, COUNT(r.id) as count FROM resource_categories c LEFT JOIN corporate_resources r ON c.id = r.category_id GROUP BY c.id, c.name, c.icon, c.color ORDER BY count DESC');
    const recentUploads = await query('SELECT r.id, r.name, r.file_type, r.created_at, u.name as uploader_name, c.name as category_name FROM corporate_resources r JOIN users u ON r.uploaded_by = u.id LEFT JOIN resource_categories c ON r.category_id = c.id ORDER BY r.created_at DESC LIMIT 10');
    const totalSize = await query('SELECT COALESCE(SUM(file_size), 0) as total FROM corporate_resources');
    res.json({ success: true, data: { total_resources: parseInt(total.rows[0].count), by_category: byCategory.rows, recent_uploads: recentUploads.rows, total_size_bytes: parseInt(totalSize.rows[0].total), total_size_mb: (parseInt(totalSize.rows[0].total) / (1024 * 1024)).toFixed(2) } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener estadisticas' });
  }
});

export default router;
