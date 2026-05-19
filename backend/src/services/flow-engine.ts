import { query } from '../db';

export interface BranchContext {
  userRole: string;
  userDepartment?: string;
  previousSteps: Array<{ stepId: string; status: string; score?: number }>;
  metadata?: Record<string, any>;
}

/**
 * Evalúa branch_logic de un paso para determinar si debe mostrarse/saltarse
 * branch_logic ejemplo: { "if_role": ["tecnico"], "skip_if_completed": ["step-xyz"] }
 */
export async function shouldIncludeStep(stepId: string, context: BranchContext): Promise<boolean> {
  const step = await query('SELECT branch_logic FROM flow_steps WHERE id = $1', [stepId]);
  const branchLogic = step.rows[0]?.branch_logic || {};

  // Regla: filtrar por rol
  if (branchLogic.if_role && !branchLogic.if_role.includes(context.userRole)) {
    return false;
  }

  // Regla: saltar si otro paso ya fue completado
  if (branchLogic.skip_if_completed) {
    const completed = context.previousSteps
      .filter(s => s.status === 'completed')
      .map(s => s.stepId);
    if (branchLogic.skip_if_completed.some((id: string) => completed.includes(id))) {
      return false;
    }
  }

  // Regla: requerir score mínimo en paso anterior
  if (branchLogic.require_min_score) {
    const prev = context.previousSteps.find(s => s.stepId === branchLogic.require_min_score.step_id);
    if (!prev || (prev.score || 0) < branchLogic.require_min_score.min_score) {
      return false;
    }
  }

  return true;
}

/**
 * Calcula el próximo paso válido respetando dependencias Y branching
 */
export async function getNextStep(
  flowId: string, 
  userId: string, 
  currentStepId: string | null
): Promise<{ stepId: string | null; reason?: string }> {
  
  // Obtener contexto del usuario
  const userCtx = await query(
    `SELECT u.role, o.metadata->>'department' as department 
     FROM users u 
     LEFT JOIN org_members om ON u.id = om.user_id 
     LEFT JOIN organizations o ON om.org_id = o.id 
     WHERE u.id = $1`,
    [userId]
  );
  
  const branchContext: BranchContext = {
    userRole: userCtx.rows[0]?.role || 'general',
    userDepartment: userCtx.rows[0]?.department,
    previousSteps: []
  };

  // Obtener progreso previo del usuario en este flujo
  const progress = await query(
    `SELECT sp.step_id, sp.status, sp.validation_data->>'score' as score
     FROM user_step_progress sp
     JOIN user_flow_progress ufp ON sp.flow_progress_id = ufp.id
     WHERE ufp.user_id = $1 AND ufp.flow_id = $2`,
    [userId, flowId]
  );
  
  branchContext.previousSteps = progress.rows.map((r: any) => ({
    stepId: r.step_id,
    status: r.status,
    score: r.score ? parseFloat(r.score) : undefined
  }));

  // Obtener pasos candidatos (después del actual o todos si es el inicio)
  const candidateSteps = await query(
    `SELECT id, step_order 
     FROM flow_steps 
     WHERE flow_id = $1 
     ${currentStepId ? 'AND step_order > (SELECT step_order FROM flow_steps WHERE id = $2)' : ''}
     ORDER BY step_order`,
    currentStepId ? [flowId, currentStepId] : [flowId]
  );

  // Evaluar cada candidato contra branching + dependencias
  for (const step of candidateSteps.rows) {
    const include = await shouldIncludeStep(step.id, branchContext);
    if (!include) continue;

    // Verificar dependencias clásicas
    const deps = await query(
      `SELECT d.dependency_type, d.min_score, sp.status, sp.validation_data->>'score' as dep_score
       FROM step_dependencies d
       LEFT JOIN user_step_progress sp ON d.depends_on_step_id = sp.step_id AND sp.user_id = $1
       WHERE d.step_id = $2`,
      [userId, step.id]
    );

    const allDepsMet = deps.rows.every((dep: any) => {
      if (dep.dependency_type === 'completion') return dep.status === 'completed';
      if (dep.dependency_type === 'score') return (parseFloat(dep.dep_score) || 0) >= dep.min_score;
      return true;
    });

    if (allDepsMet) {
      return { stepId: step.id };
    }
  }

  return { stepId: null, reason: 'No more valid steps' };
}

/**
 * Crea un snapshot inmutable del flujo al iniciar (para auditoría)
 * Versión robusta con logging para debugging
 */
export async function createFlowVersionSnapshot(flowId: string, createdBy: string): Promise<string> {
  console.log(`[FlowEngine] Creating snapshot for flow ${flowId} by ${createdBy}`);
  
  try {
    // Obtener definición completa del flujo
    const flow = await query('SELECT * FROM onboarding_flows WHERE id = $1', [flowId]);
    if (flow.rows.length === 0) {
      throw new Error(`Flow ${flowId} not found`);
    }
    
    const steps = await query(
      'SELECT * FROM flow_steps WHERE flow_id = $1 ORDER BY step_order', 
      [flowId]
    );
    
    const deps = await query(
      'SELECT * FROM step_dependencies WHERE step_id IN (SELECT id FROM flow_steps WHERE flow_id = $1)', 
      [flowId]
    );

    // Calcular nueva versión
    const currentVersion = flow.rows[0].version || 1;
    const newVersion = currentVersion + 1;
    
    // Construir definición para snapshot
    const definition = {
      flow: flow.rows[0],
      steps: steps.rows,
      dependencies: deps.rows,
      captured_at: new Date().toISOString()
    };

    console.log(`[FlowEngine] Inserting version ${newVersion} into flow_versions`);
    
    // Insertar snapshot
    const result = await query(
      `INSERT INTO flow_versions (flow_id, version, definition, created_by) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [flowId, newVersion, JSON.stringify(definition), createdBy]
    );

    // Actualizar versión del flujo principal
    await query('UPDATE onboarding_flows SET version = $1 WHERE id = $2', [newVersion, flowId]);
    
    console.log(`[FlowEngine] ✓ Snapshot created: version_id=${result.rows[0].id}`);
    return result.rows[0].id;
    
  } catch (error) {
    console.error('[FlowEngine] ✗ Error creating snapshot:', error);
    // No lanzamos el error para no romper el flujo del usuario, pero logueamos
    return ''; 
  }
}
