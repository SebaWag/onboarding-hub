import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth'
import { AuthRequest } from '../types';
import { getNextStep, createFlowVersionSnapshot } from '../services/flow-engine';

const router = Router();

// ============================================
// FLOWS - Flujos de onboarding
// ============================================

// Listar flujos
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { role_type, program_id, status } = req.query;
    let sql = 'SELECT f.*, p.title as program_name FROM onboarding_flows f LEFT JOIN programs p ON f.program_id = p.id WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (role_type) {
      sql += ` AND f.role_type = $${paramIndex++}`;
      params.push(role_type);
    }
    if (program_id) {
      sql += ` AND f.program_id = $${paramIndex++}`;
      params.push(program_id);
    }
    if (status) {
      sql += ` AND f.status = $${paramIndex++}`;
      params.push(status);
    }
    sql += ' ORDER BY f.created_at DESC';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener flujos' });
  }
});

// Obtener flujo por ID con pasos
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const flowResult = await query(
      'SELECT f.*, p.title as program_name FROM onboarding_flows f LEFT JOIN programs p ON f.program_id = p.id WHERE f.id = $1',
      [id]
    );
    if (flowResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Flujo no encontrado' });
    }

    const stepsResult = await query(
      'SELECT * FROM flow_steps WHERE flow_id = $1 ORDER BY step_order',
      [id]
    );

    const checklistsResult = await query(
      'SELECT * FROM checklists WHERE flow_id = $1',
      [id]
    );

    const flow = flowResult.rows[0];
    flow.steps = stepsResult.rows;
    flow.checklists = checklistsResult.rows;

    res.json({ success: true, data: flow });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener flujo' });
  }
});

// Crear flujo
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, role_type, program_id, estimated_days, branching_rules, auto_assign_rule, metadata } = req.body;
    const result = await query(
      `INSERT INTO onboarding_flows (name, description, role_type, program_id, estimated_days, created_by, branching_rules, auto_assign_rule, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, description, role_type, program_id, estimated_days || 30, req.user!.id, branching_rules || {}, auto_assign_rule || {}, metadata || {}]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al crear flujo' });
  }
});

// Actualizar flujo
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, role_type, status, estimated_days, branching_rules, auto_assign_rule, metadata, is_published } = req.body;
    const result = await query(
      `UPDATE onboarding_flows SET name = COALESCE($1, name), description = COALESCE($2, description),
       role_type = COALESCE($3, role_type), status = COALESCE($4, status),
       estimated_days = COALESCE($5, estimated_days), branching_rules = COALESCE($6, branching_rules),
       auto_assign_rule = COALESCE($7, auto_assign_rule), metadata = COALESCE($8, metadata),
       is_published = COALESCE($9, is_published), published_at = CASE WHEN $9 = true AND is_published = false THEN NOW() ELSE published_at END,
       updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [name, description, role_type, status, estimated_days, branching_rules, auto_assign_rule, metadata, is_published, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Flujo no encontrado' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al actualizar flujo' });
  }
});

// Eliminar flujo
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM onboarding_flows WHERE id = $1', [id]);
    res.json({ success: true, message: 'Flujo eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al eliminar flujo' });
  }
});

// Crear flujo desde template
router.post('/from-template/:templateId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { templateId } = req.params;
    const { name, program_id } = req.body;

    const templateResult = await query('SELECT * FROM flow_templates WHERE id = $1', [templateId]);
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template no encontrado' });
    }
    const template = templateResult.rows[0];
    const templateData = template.template_data;

    const flowResult = await query(
      `INSERT INTO onboarding_flows (name, description, role_type, program_id, template_id, created_by, branching_rules, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name || template.name, template.description, template.role_type, program_id, templateId, req.user!.id, templateData.branching_rules || {}, templateData.metadata || {}]
    );
    const flow = flowResult.rows[0];

    if (templateData.steps) {
      for (const step of templateData.steps) {
        await query(
          `INSERT INTO flow_steps (flow_id, name, description, step_order, step_type, module_id, content_id, is_required, estimated_hours, branch_logic)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [flow.id, step.name, step.description, step.order, step.type, step.module_id, step.content_id, step.is_required !== false, step.hours, step.branch_logic || {}]
        );
      }
    }

    if (templateData.checklists) {
      for (const checklist of templateData.checklists) {
        const checklistResult = await query(
          `INSERT INTO checklists (name, flow_id, created_by) VALUES ($1, $2, $3) RETURNING *`,
          [checklist.name, flow.id, req.user!.id]
        );
        const checklistId = checklistResult.rows[0].id;
        for (let i = 0; i < checklist.items.length; i++) {
          await query(
            `INSERT INTO checklist_items (checklist_id, item_text, item_order) VALUES ($1, $2, $3)`,
            [checklistId, checklist.items[i], i + 1]
          );
        }
      }
    }

    const stepsResult = await query('SELECT * FROM flow_steps WHERE flow_id = $1 ORDER BY step_order', [flow.id]);
    flow.steps = stepsResult.rows;

    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al crear flujo desde template' });
  }
});

// ============================================
// FLOW STEPS - Pasos del flujo
// ============================================

// Agregar paso
router.post('/:flowId/steps', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { flowId } = req.params;
    const { name, description, step_type, module_id, content_id, is_required, estimated_hours, branch_logic } = req.body;

    const orderResult = await query(
      'SELECT COALESCE(MAX(step_order), 0) + 1 as next_order FROM flow_steps WHERE flow_id = $1',
      [flowId]
    );
    const nextOrder = orderResult.rows[0].next_order;

    const result = await query(
      `INSERT INTO flow_steps (flow_id, name, description, step_order, step_type, module_id, content_id, is_required, estimated_hours, branch_logic)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [flowId, name, description, nextOrder, step_type || 'task', module_id, content_id, is_required !== false, estimated_hours, branch_logic || {}]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al agregar paso' });
  }
});

// Actualizar paso
router.put('/steps/:stepId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { stepId } = req.params;
    const { name, description, step_type, is_required, estimated_hours, step_order, branch_logic } = req.body;
    const result = await query(
      `UPDATE flow_steps SET name = COALESCE($1, name), description = COALESCE($2, description),
       step_type = COALESCE($3, step_type), is_required = COALESCE($4, is_required),
       estimated_hours = COALESCE($5, estimated_hours), step_order = COALESCE($6, step_order),
       branch_logic = COALESCE($7, branch_logic)
       WHERE id = $8 RETURNING *`,
      [name, description, step_type, is_required, estimated_hours, step_order, branch_logic, stepId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Paso no encontrado' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al actualizar paso' });
  }
});

// Eliminar paso
router.delete('/steps/:stepId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { stepId } = req.params;
    await query('DELETE FROM flow_steps WHERE id = $1', [stepId]);
    res.json({ success: true, message: 'Paso eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al eliminar paso' });
  }
});

// ============================================
// DEPENDENCIES - Dependencias entre pasos
// ============================================

// Agregar dependencia
router.post('/steps/:stepId/dependencies', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { stepId } = req.params;
    const { depends_on_step_id, dependency_type, min_score } = req.body;
    const result = await query(
      `INSERT INTO step_dependencies (step_id, depends_on_step_id, dependency_type, min_score)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [stepId, depends_on_step_id, dependency_type || 'completion', min_score]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al agregar dependencia' });
  }
});

// Obtener dependencias de un paso
router.get('/steps/:stepId/dependencies', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { stepId } = req.params;
    const result = await query(
      `SELECT d.*, s.name as depends_on_name FROM step_dependencies d
       JOIN flow_steps s ON d.depends_on_step_id = s.id WHERE d.step_id = $1`,
      [stepId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener dependencias' });
  }
});

// ============================================
// PROGRESS - Progreso del usuario
// ============================================

// Iniciar flujo (CON VERSIONADO)
router.post('/:flowId/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { flowId } = req.params;
    const userId = req.user!.id;

    // Verificar si ya inició
    const existing = await query('SELECT * FROM user_flow_progress WHERE user_id = $1 AND flow_id = $2', [userId, flowId]);
    if (existing.rows.length > 0) {
      return res.json({ success: true, data: existing.rows[0], message: 'Flujo ya iniciado' });
    }

    // Crear snapshot de versión inmutable para auditoría
    const versionSnapshotId = await createFlowVersionSnapshot(flowId, userId);

    // Obtener primer paso válido (con branching)
    const firstStep = await getNextStep(flowId, userId, null);
    if (!firstStep.stepId) {
      return res.status(400).json({ success: false, error: 'No hay pasos válidos para iniciar este flujo' });
    }

    const result = await query(
      `INSERT INTO user_flow_progress (user_id, flow_id, flow_version_id, status, started_at, current_step_id)
       VALUES ($1, $2, $3, 'in_progress', NOW(), $4) RETURNING *`,
      [userId, flowId, versionSnapshotId, firstStep.stepId]
    );

    // Crear progreso para cada paso del flujo
    const steps = await query('SELECT id FROM flow_steps WHERE flow_id = $1', [flowId]);
    for (const step of steps.rows) {
      await query(
        `INSERT INTO user_step_progress (user_id, step_id, flow_progress_id, status)
         VALUES ($1, $2, $3, 'pending')`,
        [userId, step.id, result.rows[0].id]
      );
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error starting flow:', error);
    res.status(500).json({ success: false, error: 'Error al iniciar flujo' });
  }
});

// Obtener progreso del usuario en un flujo
router.get('/:flowId/progress', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { flowId } = req.params;
    const userId = req.user!.id;

    const progressResult = await query(
      'SELECT ufp.*, fv.version as flow_version FROM user_flow_progress ufp LEFT JOIN flow_versions fv ON ufp.flow_version_id = fv.id WHERE user_id = $1 AND flow_id = $2',
      [userId, flowId]
    );

    if (progressResult.rows.length === 0) {
      return res.json({ success: true, data: null, message: 'Flujo no iniciado' });
    }

    const progress = progressResult.rows[0];

    const stepsProgressResult = await query(
      `SELECT sp.*, fs.name as step_name, fs.step_type, fs.step_order, fs.branch_logic
       FROM user_step_progress sp
       JOIN flow_steps fs ON sp.step_id = fs.id
       WHERE sp.flow_progress_id = $1 ORDER BY fs.step_order`,
      [progress.id]
    );

    progress.steps = stepsProgressResult.rows;

    res.json({ success: true, data: progress });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener progreso' });
  }
});

// Completar paso (CON BRANCHING LOGIC)
router.post('/steps/:stepId/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { stepId } = req.params;
    const { score, notes, validation_data } = req.body;
    const userId = req.user!.id;

    // Verificar dependencias clásicas
    const dependencies = await query(
      `SELECT d.*, sp.status as dep_status, sp.validation_data->>'score' as dep_score
       FROM step_dependencies d
       LEFT JOIN user_step_progress sp ON d.depends_on_step_id = sp.step_id AND sp.user_id = $1
       WHERE d.step_id = $2`,
      [userId, stepId]
    );

    for (const dep of dependencies.rows) {
      if (dep.dependency_type === 'completion' && dep.dep_status !== 'completed') {
        return res.status(400).json({ success: false, error: 'Debe completar los pasos dependientes primero' });
      }
      if (dep.dependency_type === 'score' && (dep.dep_score || 0) < dep.min_score) {
        return res.status(400).json({ success: false, error: `Debe obtener al menos ${dep.min_score} puntos en el paso anterior` });
      }
    }

    // Actualizar progreso del paso con validación IA
    const result = await query(
      `UPDATE user_step_progress SET status = 'completed', completed_at = NOW(), score = $1, notes = $2, validation_data = COALESCE($3, validation_data)
       WHERE user_id = $4 AND step_id = $5 RETURNING *`,
      [score, notes, validation_data ? JSON.stringify(validation_data) : null, userId, stepId]
    );

    // Calcular progreso general del flujo
    const stepInfo = await query('SELECT flow_id FROM flow_steps WHERE id = $1', [stepId]);
    const flowId = stepInfo.rows[0].flow_id;

    const totalSteps = await query('SELECT COUNT(*) as total FROM flow_steps WHERE flow_id = $1', [flowId]);
    const completedSteps = await query(
      `SELECT COUNT(*) as completed FROM user_step_progress sp
       JOIN flow_steps fs ON sp.step_id = fs.id
       WHERE sp.user_id = $1 AND fs.flow_id = $2 AND sp.status = 'completed'`,
      [userId, flowId]
    );

    const progressPercentage = totalSteps.rows[0].total > 0 
      ? (parseInt(completedSteps.rows[0].completed) / parseInt(totalSteps.rows[0].total)) * 100 
      : 100;

    // === NUEVO: Calcular siguiente paso con branching logic ===
    const next = await getNextStep(flowId, userId, stepId);
    const nextStepId = next.stepId;
    // =========================================================

    // Actualizar progreso del flujo
    const flowStatus = progressPercentage >= 100 ? 'completed' : 'in_progress';
    await query(
      `UPDATE user_flow_progress SET progress_percentage = $1, current_step_id = $2,
       status = $3, completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE NULL END, updated_at = NOW()
       WHERE user_id = $4 AND flow_id = $5`,
      [progressPercentage, nextStepId || null, flowStatus, userId, flowId]
    );

    res.json({ 
      success: true, 
      data: result.rows[0], 
      progress_percentage: progressPercentage,
      next_step: nextStepId,
      branching_reason: next.reason
    });
  } catch (error) {
    console.error('Error completing step:', error);
    res.status(500).json({ success: false, error: 'Error al completar paso' });
  }
});

// ============================================
// CHECKLISTS
// ============================================

// Obtener checklist con items
router.get('/checklists/:checklistId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { checklistId } = req.params;
    const userId = req.user!.id;

    const checklistResult = await query('SELECT * FROM checklists WHERE id = $1', [checklistId]);
    if (checklistResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Checklist no encontrado' });
    }

    const itemsResult = await query(
      `SELECT ci.*, uci.is_completed, uci.completed_at, uci.notes as user_notes
       FROM checklist_items ci
       LEFT JOIN user_checklist_items uci ON ci.id = uci.checklist_item_id AND uci.user_id = $1
       WHERE ci.checklist_id = $2 ORDER BY ci.item_order`,
      [userId, checklistId]
    );

    const checklist = checklistResult.rows[0];
    checklist.items = itemsResult.rows;
    checklist.completion_percentage = itemsResult.rows.length > 0
      ? (itemsResult.rows.filter((i: any) => i.is_completed).length / itemsResult.rows.length) * 100
      : 0;

    res.json({ success: true, data: checklist });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener checklist' });
  }
});

// Marcar item como completado
router.post('/checklists/items/:itemId/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const { notes } = req.body;
    const userId = req.user!.id;

    const result = await query(
      `INSERT INTO user_checklist_items (user_id, checklist_item_id, is_completed, completed_at, notes)
       VALUES ($1, $2, true, NOW(), $3)
       ON CONFLICT (user_id, checklist_item_id)
       DO UPDATE SET is_completed = true, completed_at = NOW(), notes = $3, updated_at = NOW()
       RETURNING *`,
      [userId, itemId, notes]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al completar item' });
  }
});

// ============================================
// APPROVALS - Aprobaciones
// ============================================

// Solicitar aprobación
router.post('/approvals', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { approval_type, reference_id, reference_type, approver_id, comments } = req.body;
    const result = await query(
      `INSERT INTO approvals (approval_type, reference_id, reference_type, requested_by, approver_id, comments)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [approval_type, reference_id, reference_type, req.user!.id, approver_id, comments]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al solicitar aprobación' });
  }
});

// Listar aprobaciones pendientes
router.get('/approvals/pending', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT a.*, u.name as requester_name FROM approvals a
       JOIN users u ON a.requested_by = u.id
       WHERE a.approver_id = $1 AND a.status = 'pending' ORDER BY a.created_at DESC`,
      [req.user!.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener aprobaciones' });
  }
});

// Procesar aprobación
router.put('/approvals/:approvalId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { approvalId } = req.params;
    const { status, comments } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Estado inválido' });
    }

    const result = await query(
      `UPDATE approvals SET status = $1, comments = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND approver_id = $4 RETURNING *`,
      [status, comments, approvalId, req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Aprobación no encontrada' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al procesar aprobación' });
  }
});

// ============================================
// TEMPLATES - Templates de flujos
// ============================================

// Listar templates
router.get('/templates/list', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { role_type } = req.query;
    let sql = 'SELECT * FROM flow_templates WHERE 1=1';
    const params: any[] = [];

    if (role_type) {
      sql += ' AND role_type = $1';
      params.push(role_type);
    }
    sql += ' ORDER BY is_system DESC, name';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener templates' });
  }
});

// ============================================
// METRICS - Métricas
// ============================================

// Métricas generales
router.get('/metrics/overview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const totalFlows = await query('SELECT COUNT(*) as total FROM onboarding_flows WHERE status = $1', ['active']);
    const totalInProgress = await query("SELECT COUNT(*) as total FROM user_flow_progress WHERE status = 'in_progress'");
    const totalCompleted = await query("SELECT COUNT(*) as total FROM user_flow_progress WHERE status = 'completed'");
    const avgCompletion = await query("SELECT AVG(progress_percentage) as avg FROM user_flow_progress WHERE status = 'in_progress'");

    const byRole = await query(
      `SELECT f.role_type, COUNT(DISTINCT ufp.user_id) as users, AVG(ufp.progress_percentage) as avg_progress
       FROM onboarding_flows f
       LEFT JOIN user_flow_progress ufp ON f.id = ufp.flow_id
       GROUP BY f.role_type`
    );

    const pendingApprovals = await query("SELECT COUNT(*) as total FROM approvals WHERE status = 'pending'");

    res.json({
      success: true,
      data: {
        total_flows: parseInt(totalFlows.rows[0].total),
        in_progress: parseInt(totalInProgress.rows[0].total),
        completed: parseInt(totalCompleted.rows[0].total),
        avg_completion: parseFloat(avgCompletion.rows[0].avg || 0).toFixed(1),
        by_role: byRole.rows,
        pending_approvals: parseInt(pendingApprovals.rows[0].total)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener métricas' });
  }
});

// Progreso por usuario
router.get('/metrics/users', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, f.name as flow_name, f.role_type,
       ufp.status, ufp.progress_percentage, ufp.started_at, ufp.completed_at
       FROM user_flow_progress ufp
       JOIN users u ON ufp.user_id = u.id
       JOIN onboarding_flows f ON ufp.flow_id = f.id
       ORDER BY ufp.progress_percentage DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener métricas de usuarios' });
  }
});

export default router;
