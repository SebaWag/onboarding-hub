import { Router, Response } from 'express';
import multer from 'multer';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { uploadBuffer, getPresignedUrl, deleteFile, BUCKET_NAME } from '../services/storage';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// Columnas por defecto para nuevos tableros
const DEFAULT_COLUMNS = [
  { name: 'Backlog', color: '#6366f1', order: 1 },
  { name: 'Por Hacer', color: '#8b5cf6', order: 2 },
  { name: 'En Progreso', color: '#f59e0b', order: 3, wip_limit: 5 },
  { name: 'En Revisión', color: '#3b82f6', order: 4 },
  { name: 'Completado', color: '#10b981', order: 5, is_done: true }
];

// ============================================
// BOARDS - Tableros Kanban
// ============================================

// Listar tableros
router.get('/boards', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { board_type, program_id } = req.query;
    let sql = `
      SELECT b.*, u.name as owner_name,
        (SELECT COUNT(*) FROM kanban_cards WHERE board_id = b.id) as card_count,
        (SELECT COUNT(*) FROM kanban_columns WHERE board_id = b.id) as column_count
      FROM kanban_boards b
      LEFT JOIN users u ON b.owner_id = u.id
      WHERE (b.owner_id = $1 OR b.id IN (
        SELECT DISTINCT board_id FROM kanban_cards WHERE assigned_to = $1
      ))
      AND b.is_archived = false
    `;
    const params: any[] = [req.user!.id];
    let paramIndex = 2;

    if (board_type) {
      sql += ` AND b.board_type = $${paramIndex++}`;
      params.push(board_type);
    }
    if (program_id) {
      sql += ` AND b.program_id = $${paramIndex++}`;
      params.push(program_id);
    }

    sql += ' ORDER BY b.updated_at DESC';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener tableros' });
  }
});

// Obtener tablero por ID con columnas y tarjetas
router.get('/boards/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Obtener tablero
    const boardResult = await query(
      `SELECT b.*, u.name as owner_name
       FROM kanban_boards b
       LEFT JOIN users u ON b.owner_id = u.id
       WHERE b.id = $1`,
      [id]
    );

    if (boardResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tablero no encontrado' });
    }

    const board = boardResult.rows[0];

    // Obtener columnas
    const columnsResult = await query(
      'SELECT * FROM kanban_columns WHERE board_id = $1 ORDER BY column_order',
      [id]
    );

    // Obtener tarjetas con información de usuario asignado
    const cardsResult = await query(
      `SELECT c.*, u.name as assigned_name, u.email as assigned_email,
              creator.name as creator_name
       FROM kanban_cards c
       LEFT JOIN users u ON c.assigned_to = u.id
       LEFT JOIN users creator ON c.created_by = creator.id
       WHERE c.board_id = $1
       ORDER BY c.card_order`,
      [id]
    );

    // Obtener etiquetas del tablero
    const labelsResult = await query(
      'SELECT * FROM kanban_labels WHERE board_id = $1',
      [id]
    );

    // Organizar tarjetas por columna
    board.columns = columnsResult.rows.map(col => ({
      ...col,
      cards: cardsResult.rows.filter(card => card.column_id === col.id)
    }));
    board.labels = labelsResult.rows;

    res.json({ success: true, data: board });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener tablero' });
  }
});

// Crear tablero
router.post('/boards', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, board_type, program_id, settings } = req.body;

    // Crear tablero
    const boardResult = await query(
      `INSERT INTO kanban_boards (name, description, board_type, owner_id, program_id, settings)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, description, board_type || 'project', req.user!.id, program_id, settings || {}]
    );

    const board = boardResult.rows[0];

    // Crear columnas por defecto
    for (const col of DEFAULT_COLUMNS) {
      await query(
        `INSERT INTO kanban_columns (board_id, name, color, column_order, wip_limit, is_done_column)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [board.id, col.name, col.color, col.order, col.wip_limit || null, col.is_done || false]
      );
    }

    // Crear etiquetas por defecto
    const defaultLabels = [
      { name: 'Bug', color: '#ef4444' },
      { name: 'Feature', color: '#3b82f6' },
      { name: 'Mejora', color: '#10b981' },
      { name: 'Urgente', color: '#f59e0b' }
    ];
    for (const label of defaultLabels) {
      await query(
        'INSERT INTO kanban_labels (board_id, name, color) VALUES ($1, $2, $3)',
        [board.id, label.name, label.color]
      );
    }

    res.status(201).json({ success: true, data: board });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al crear tablero' });
  }
});

// Actualizar tablero
router.put('/boards/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, is_archived, settings } = req.body;

    const result = await query(
      `UPDATE kanban_boards
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_archived = COALESCE($3, is_archived),
           settings = COALESCE($4, settings),
           updated_at = NOW()
       WHERE id = $5 AND owner_id = $6
       RETURNING *`,
      [name, description, is_archived, settings, id, req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tablero no encontrado' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al actualizar tablero' });
  }
});

// Eliminar tablero
router.delete('/boards/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM kanban_boards WHERE id = $1 AND owner_id = $2', [id, req.user!.id]);
    res.json({ success: true, message: 'Tablero eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al eliminar tablero' });
  }
});

// ============================================
// COLUMNS - Columnas
// ============================================

// Agregar columna
router.post('/boards/:boardId/columns', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { boardId } = req.params;
    const { name, color, wip_limit } = req.body;

    // Obtener siguiente orden
    const orderResult = await query(
      'SELECT COALESCE(MAX(column_order), 0) + 1 as next_order FROM kanban_columns WHERE board_id = $1',
      [boardId]
    );

    const result = await query(
      `INSERT INTO kanban_columns (board_id, name, color, column_order, wip_limit)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [boardId, name, color || '#6366f1', orderResult.rows[0].next_order, wip_limit]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al agregar columna' });
  }
});

// Actualizar columna
router.put('/columns/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color, wip_limit, column_order, is_done_column } = req.body;

    const result = await query(
      `UPDATE kanban_columns
       SET name = COALESCE($1, name),
           color = COALESCE($2, color),
           wip_limit = COALESCE($3, wip_limit),
           column_order = COALESCE($4, column_order),
           is_done_column = COALESCE($5, is_done_column)
       WHERE id = $6
       RETURNING *`,
      [name, color, wip_limit, column_order, is_done_column, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Columna no encontrada' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al actualizar columna' });
  }
});

// Eliminar columna
router.delete('/columns/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM kanban_columns WHERE id = $1', [id]);
    res.json({ success: true, message: 'Columna eliminada' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al eliminar columna' });
  }
});

// ============================================
// CARDS - Tarjetas
// ============================================

// Crear tarjeta
router.post('/cards', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { board_id, column_id, title, description, priority, assigned_to, due_date, estimated_hours, tags, color } = req.body;

    // Obtener siguiente orden
    const orderResult = await query(
      'SELECT COALESCE(MAX(card_order), 0) + 1 as next_order FROM kanban_cards WHERE column_id = $1',
      [column_id]
    );

    const result = await query(
      `INSERT INTO kanban_cards (board_id, column_id, title, description, card_order, priority, assigned_to, due_date, estimated_hours, tags, color, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [board_id, column_id, title, description, orderResult.rows[0].next_order, priority || 'medium', assigned_to, due_date, estimated_hours, tags || [], color, req.user!.id]
    );

    // Registrar actividad
    await query(
      `INSERT INTO kanban_activity (card_id, user_id, action, new_value)
       VALUES ($1, $2, 'created', $3)`,
      [result.rows[0].id, req.user!.id, title]
    );

    // Actualizar updated_at del tablero
    await query('UPDATE kanban_boards SET updated_at = NOW() WHERE id = $1', [board_id]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al crear tarjeta' });
  }
});

// Obtener tarjeta por ID
router.get('/cards/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const cardResult = await query(
      `SELECT c.*, u.name as assigned_name, creator.name as creator_name,
              col.name as column_name
       FROM kanban_cards c
       LEFT JOIN users u ON c.assigned_to = u.id
       LEFT JOIN users creator ON c.created_by = creator.id
       LEFT JOIN kanban_columns col ON c.column_id = col.id
       WHERE c.id = $1`,
      [id]
    );

    if (cardResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tarjeta no encontrada' });
    }

    const card = cardResult.rows[0];

    // Obtener comentarios
    const commentsResult = await query(
      `SELECT k.*, u.name as user_name
       FROM kanban_comments k
       JOIN users u ON k.user_id = u.id
       WHERE k.card_id = $1 ORDER BY k.created_at DESC`,
      [id]
    );

    // Obtener adjuntos
    const attachmentsResult = await query(
      `SELECT a.*, u.name as uploader_name
       FROM kanban_attachments a
       JOIN users u ON a.uploaded_by = u.id
       WHERE a.card_id = $1 ORDER BY a.created_at DESC`,
      [id]
    );

    // Obtener actividad
    const activityResult = await query(
      `SELECT a.*, u.name as user_name
       FROM kanban_activity a
       JOIN users u ON a.user_id = u.id
       WHERE a.card_id = $1 ORDER BY a.created_at DESC LIMIT 20`,
      [id]
    );

    // Obtener etiquetas
    const labelsResult = await query(
      `SELECT l.* FROM kanban_labels l
       JOIN kanban_card_labels cl ON l.id = cl.label_id
       WHERE cl.card_id = $1`,
      [id]
    );

    card.comments = commentsResult.rows;
    card.attachments = attachmentsResult.rows;
    card.activity = activityResult.rows;
    card.labels = labelsResult.rows;

    res.json({ success: true, data: card });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener tarjeta' });
  }
});

// Actualizar tarjeta
router.put('/cards/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, priority, assigned_to, due_date, estimated_hours, tags, color } = req.body;

    const result = await query(
      `UPDATE kanban_cards
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           priority = COALESCE($3, priority),
           assigned_to = COALESCE($4, assigned_to),
           due_date = COALESCE($5, due_date),
           estimated_hours = COALESCE($6, estimated_hours),
           tags = COALESCE($7, tags),
           color = COALESCE($8, color),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [title, description, priority, assigned_to, due_date, estimated_hours, tags, color, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tarjeta no encontrada' });
    }

    // Registrar actividad
    await query(
      `INSERT INTO kanban_activity (card_id, user_id, action, new_value)
       VALUES ($1, $2, 'updated', 'Campos actualizados')`,
      [id, req.user!.id]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al actualizar tarjeta' });
  }
});

// Mover tarjeta a otra columna
router.put('/cards/:id/move', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { column_id, card_order } = req.body;

    // Obtener tarjeta actual
    const currentCard = await query('SELECT * FROM kanban_cards WHERE id = $1', [id]);
    if (currentCard.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tarjeta no encontrada' });
    }

    const oldColumnId = currentCard.rows[0].column_id;

    // Verificar límite WIP de la columna destino
    const columnResult = await query('SELECT * FROM kanban_columns WHERE id = $1', [column_id]);
    if (columnResult.rows[0]?.wip_limit) {
      const currentCount = await query(
        'SELECT COUNT(*) as count FROM kanban_cards WHERE column_id = $1',
        [column_id]
      );
      if (parseInt(currentCount.rows[0].count) >= columnResult.rows[0].wip_limit && oldColumnId !== column_id) {
        return res.status(400).json({ success: false, error: 'Límite WIP alcanzado para esta columna' });
      }
    }

    // Mover tarjeta
    const result = await query(
      `UPDATE kanban_cards
       SET column_id = $1, card_order = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [column_id, card_order, id]
    );

    // Registrar actividad
    const oldCol = await query('SELECT name FROM kanban_columns WHERE id = $1', [oldColumnId]);
    const newCol = await query('SELECT name FROM kanban_columns WHERE id = $1', [column_id]);
    await query(
      `INSERT INTO kanban_activity (card_id, user_id, action, old_value, new_value)
       VALUES ($1, $2, 'moved', $3, $4)`,
      [id, req.user!.id, oldCol.rows[0]?.name, newCol.rows[0]?.name]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al mover tarjeta' });
  }
});

// Eliminar tarjeta
router.delete('/cards/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM kanban_cards WHERE id = $1', [id]);
    res.json({ success: true, message: 'Tarjeta eliminada' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al eliminar tarjeta' });
  }
});

// ============================================
// COMMENTS - Comentarios
// ============================================

// Agregar comentario
router.post('/cards/:cardId/comments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const { content } = req.body;

    const result = await query(
      `INSERT INTO kanban_comments (card_id, user_id, content)
       VALUES ($1, $2, $3) RETURNING *`,
      [cardId, req.user!.id, content]
    );

    // Obtener comentario con nombre de usuario
    const commentResult = await query(
      `SELECT k.*, u.name as user_name
       FROM kanban_comments k
       JOIN users u ON k.user_id = u.id
       WHERE k.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json({ success: true, data: commentResult.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al agregar comentario' });
  }
});

// ============================================
// ATTACHMENTS - Archivos adjuntos (usando SeaweedFS)
// ============================================

// Subir adjunto
router.post('/cards/:cardId/attachments', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No se proporcionó archivo' });
    }

    const fileName = `kanban/${cardId}/${uuidv4()}-${file.originalname}`;

    // Upload using SeaweedFS (S3-compatible)
    const uploadResult = await uploadBuffer(file.buffer, fileName, file.mimetype);

    // Save attachment metadata to database (using minio_path column for compatibility)
    const result = await query(
      `INSERT INTO kanban_attachments (card_id, file_name, file_type, file_size, minio_path, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [cardId, file.originalname, file.mimetype, file.size, fileName, req.user!.id]
    );

    // Add URL to response
    result.rows[0].url = uploadResult.url;

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ success: false, error: 'Error al subir adjunto: ' + error.message });
  }
});

// Obtener URL de descarga de adjunto
router.get('/attachments/:id/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const attachmentResult = await query(
      'SELECT minio_path, file_name FROM kanban_attachments WHERE id = $1',
      [id]
    );

    if (attachmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Adjunto no encontrado' });
    }

    const { url } = await getPresignedUrl(attachmentResult.rows[0].minio_path, 3600);

    res.json({ success: true, data: { url, file_name: attachmentResult.rows[0].file_name } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al generar URL' });
  }
});

// ============================================
// LABELS - Etiquetas
// ============================================

// Crear etiqueta
router.post('/boards/:boardId/labels', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { boardId } = req.params;
    const { name, color } = req.body;

    const result = await query(
      'INSERT INTO kanban_labels (board_id, name, color) VALUES ($1, $2, $3) RETURNING *',
      [boardId, name, color]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al crear etiqueta' });
  }
});

// Agregar etiqueta a tarjeta
router.post('/cards/:cardId/labels/:labelId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { cardId, labelId } = req.params;
    await query(
      'INSERT INTO kanban_card_labels (card_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [cardId, labelId]
    );
    res.json({ success: true, message: 'Etiqueta agregada' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al agregar etiqueta' });
  }
});

// Remover etiqueta de tarjeta
router.delete('/cards/:cardId/labels/:labelId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { cardId, labelId } = req.params;
    await query('DELETE FROM kanban_card_labels WHERE card_id = $1 AND label_id = $2', [cardId, labelId]);
    res.json({ success: true, message: 'Etiqueta removida' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al remover etiqueta' });
  }
});

// ============================================
// METRICS - Reportes
// ============================================

router.get('/boards/:boardId/metrics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { boardId } = req.params;

    // Total de tarjetas por columna
    const byColumn = await query(
      `SELECT col.name, col.color, COUNT(c.id) as count
       FROM kanban_columns col
       LEFT JOIN kanban_cards c ON col.id = c.column_id
       WHERE col.board_id = $1
       GROUP BY col.id, col.name, col.color
       ORDER BY col.column_order`,
      [boardId]
    );

    // Tarjetas por prioridad
    const byPriority = await query(
      `SELECT priority, COUNT(*) as count
       FROM kanban_cards WHERE board_id = $1
       GROUP BY priority`,
      [boardId]
    );

    // Tarjetas por usuario asignado
    const byAssignee = await query(
      `SELECT u.name, COUNT(c.id) as count
       FROM kanban_cards c
       LEFT JOIN users u ON c.assigned_to = u.id
       WHERE c.board_id = $1
       GROUP BY u.name`,
      [boardId]
    );

    // Tarjetas vencidas
    const overdue = await query(
      `SELECT COUNT(*) as count
       FROM kanban_cards
       WHERE board_id = $1 AND due_date < NOW()::date
       AND column_id NOT IN (SELECT id FROM kanban_columns WHERE board_id = $1 AND is_done_column = true)`,
      [boardId]
    );

    res.json({
      success: true,
      data: {
        by_column: byColumn.rows,
        by_priority: byPriority.rows,
        by_assignee: byAssignee.rows,
        overdue_count: parseInt(overdue.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener métricas' });
  }
});

// Vista de calendario
router.get('/boards/:boardId/calendar', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { boardId } = req.params;
    const { start_date, end_date } = req.query;

    let sql = `
      SELECT c.id, c.title, c.due_date, c.priority, u.name as assigned_name,
             col.name as column_name, col.color as column_color
      FROM kanban_cards c
      LEFT JOIN users u ON c.assigned_to = u.id
      LEFT JOIN kanban_columns col ON c.column_id = col.id
      WHERE c.board_id = $1 AND c.due_date IS NOT NULL
    `;
    const params: any[] = [boardId];

    if (start_date) {
      sql += ` AND c.due_date >= $2`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND c.due_date <= $${params.length + 1}`;
      params.push(end_date);
    }

    sql += ' ORDER BY c.due_date';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener calendario' });
  }
});

export default router;
