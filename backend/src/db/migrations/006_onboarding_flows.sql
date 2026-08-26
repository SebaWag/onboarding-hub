-- =============================================
-- FASE 1: Onboarding Flows & Checklists
-- =============================================

CREATE TABLE IF NOT EXISTS onboarding_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    role_type VARCHAR(50) NOT NULL CHECK (role_type IN ('ejecutivo', 'tecnico', 'comercial', 'general')),
    program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
    template_id UUID,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    estimated_days INTEGER DEFAULT 30,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID REFERENCES onboarding_flows(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    step_order INTEGER NOT NULL,
    step_type VARCHAR(50) DEFAULT 'task' CHECK (step_type IN ('task', 'video', 'quiz', 'document', 'approval')),
    module_id UUID REFERENCES modules(id),
    content_id UUID REFERENCES contents(id),
    is_required BOOLEAN DEFAULT true,
    estimated_hours DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS step_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id UUID REFERENCES flow_steps(id) ON DELETE CASCADE,
    depends_on_step_id UUID REFERENCES flow_steps(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) DEFAULT 'completion' CHECK (dependency_type IN ('completion', 'approval', 'score')),
    min_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(step_id, depends_on_step_id)
);

CREATE TABLE IF NOT EXISTS user_flow_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    flow_id UUID REFERENCES onboarding_flows(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'paused')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    current_step_id UUID REFERENCES flow_steps(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, flow_id)
);

CREATE TABLE IF NOT EXISTS user_step_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    step_id UUID REFERENCES flow_steps(id) ON DELETE CASCADE,
    flow_progress_id UUID REFERENCES user_flow_progress(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    score DECIMAL(5,2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, step_id)
);

CREATE TABLE IF NOT EXISTS checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    checklist_type VARCHAR(50) DEFAULT 'manual' CHECK (checklist_type IN ('manual', 'automated', 'hybrid')),
    flow_id UUID REFERENCES onboarding_flows(id) ON DELETE CASCADE,
    step_id UUID REFERENCES flow_steps(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID REFERENCES checklists(id) ON DELETE CASCADE,
    item_text TEXT NOT NULL,
    item_order INTEGER NOT NULL,
    is_required BOOLEAN DEFAULT true,
    auto_verify_query TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    checklist_item_id UUID REFERENCES checklist_items(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    verified_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, checklist_item_id)
);

CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_type VARCHAR(50) NOT NULL CHECK (approval_type IN ('flow_step', 'checklist', 'document', 'completion')),
    reference_id UUID NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    requested_by UUID REFERENCES users(id),
    approver_id UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    comments TEXT,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    role_type VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    is_system BOOLEAN DEFAULT false,
    template_data JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indices Fase 1
CREATE INDEX IF NOT EXISTS idx_flows_role_type ON onboarding_flows(role_type);
CREATE INDEX IF NOT EXISTS idx_flows_program_id ON onboarding_flows(program_id);
CREATE INDEX IF NOT EXISTS idx_flow_steps_flow_id ON flow_steps(flow_id);
CREATE INDEX IF NOT EXISTS idx_step_dependencies_step_id ON step_dependencies(step_id);
CREATE INDEX IF NOT EXISTS idx_user_flow_progress_user_id ON user_flow_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_flow_progress_flow_id ON user_flow_progress(flow_id);
CREATE INDEX IF NOT EXISTS idx_user_step_progress_user_id ON user_step_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_approvals_reference_id ON approvals(reference_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver_id ON approvals(approver_id);

-- =============================================
-- FASE 2: Templates y Documentos
-- =============================================

CREATE TABLE IF NOT EXISTS template_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    parent_id UUID REFERENCES template_categories(id),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporate_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES template_categories(id),
    file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('pptx', 'docx', 'xlsx', 'pdf', 'markdown', 'html')),
    minio_path VARCHAR(500),
    preview_path VARCHAR(500),
    content TEXT,
    version INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'archived')),
    tags TEXT[],
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES corporate_templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    minio_path VARCHAR(500),
    content TEXT,
    change_summary TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES corporate_templates(id) ON DELETE CASCADE,
    version_id UUID REFERENCES template_versions(id),
    requested_by UUID REFERENCES users(id),
    approver_id UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    comments TEXT,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corporate_templates_category ON corporate_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_corporate_templates_status ON corporate_templates(status);
CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id);

-- =============================================
-- FASE 3: Kanban
-- =============================================

CREATE TABLE IF NOT EXISTS kanban_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    board_type VARCHAR(50) DEFAULT 'project' CHECK (board_type IN ('project', 'onboarding', 'tasks', 'custom')),
    owner_id UUID REFERENCES users(id),
    program_id UUID REFERENCES programs(id),
    is_archived BOOLEAN DEFAULT false,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES kanban_boards(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#6366f1',
    column_order INTEGER NOT NULL,
    wip_limit INTEGER,
    is_done_column BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES kanban_boards(id) ON DELETE CASCADE,
    column_id UUID REFERENCES kanban_columns(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    card_order INTEGER NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assigned_to UUID REFERENCES users(id),
    due_date DATE,
    estimated_hours DECIMAL(5,2),
    tags TEXT[],
    color VARCHAR(20),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES kanban_boards(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_card_labels (
    card_id UUID REFERENCES kanban_cards(id) ON DELETE CASCADE,
    label_id UUID REFERENCES kanban_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, label_id)
);

CREATE TABLE IF NOT EXISTS kanban_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID REFERENCES kanban_cards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID REFERENCES kanban_cards(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    minio_path VARCHAR(500),
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID REFERENCES kanban_cards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kanban_boards_owner ON kanban_boards(owner_id);
CREATE INDEX IF NOT EXISTS idx_kanban_columns_board ON kanban_columns(board_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_board ON kanban_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_column ON kanban_cards(column_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_assigned ON kanban_cards(assigned_to);
CREATE INDEX IF NOT EXISTS idx_kanban_comments_card ON kanban_comments(card_id);

-- =============================================
-- DATOS INICIALES
-- =============================================

INSERT INTO flow_templates (name, description, role_type, category, is_system, template_data)
SELECT 'Onboarding Ejecutivo Estandar', 'Flujo completo para nuevos ejecutivos de cuenta', 'ejecutivo', 'onboarding', true, '{"steps":[{"name":"Bienvenida y Presentacion","type":"video","order":1,"hours":2},{"name":"Politicas de la Empresa","type":"document","order":2,"hours":4},{"name":"Sistemas y Herramientas","type":"video","order":3,"hours":6},{"name":"Proceso de Ventas","type":"video","order":4,"hours":8},{"name":"Quiz Conocimientos","type":"quiz","order":5,"hours":1},{"name":"Revison con Manager","type":"approval","order":6,"hours":2}],"checklists":[{"name":"Setup Inicial","items":["Cuenta de email","Acceso CRM","Tarjeta de presentacion"]},{"name":"Documentacion","items":["Contrato firmado","NDA","Manual de procedimientos"]}]}'
WHERE NOT EXISTS (SELECT 1 FROM flow_templates WHERE name = 'Onboarding Ejecutivo Estandar');

INSERT INTO flow_templates (name, description, role_type, category, is_system, template_data)
SELECT 'Onboarding Tecnico', 'Flujo para desarrolladores y personal tecnico', 'tecnico', 'onboarding', true, '{"steps":[{"name":"Setup de Entorno","type":"task","order":1,"hours":4},{"name":"Arquitectura del Sistema","type":"video","order":2,"hours":3},{"name":"Guias de Desarrollo","type":"document","order":3,"hours":6},{"name":"Primer Pull Request","type":"task","order":4,"hours":8},{"name":"Code Review con Senior","type":"approval","order":5,"hours":2},{"name":"Quiz Tecnico","type":"quiz","order":6,"hours":1}],"checklists":[{"name":"Accesos Tecnicos","items":["GitHub","AWS Console","VPN","CI/CD"]},{"name":"Herramientas","items":["IDE configurado","Docker instalado","SSH keys"]}]}'
WHERE NOT EXISTS (SELECT 1 FROM flow_templates WHERE name = 'Onboarding Tecnico');

INSERT INTO flow_templates (name, description, role_type, category, is_system, template_data)
SELECT 'Onboarding Comercial', 'Flujo para equipo de ventas y comerciales', 'comercial', 'onboarding', true, '{"steps":[{"name":"Productos y Servicios","type":"video","order":1,"hours":6},{"name":"Objetivos de Ventas","type":"document","order":2,"hours":2},{"name":"Tecnicas de Negociacion","type":"video","order":3,"hours":4},{"name":"CRM y Pipeline","type":"video","order":4,"hours":3},{"name":"Simulacion de Venta","type":"task","order":5,"hours":4},{"name":"Aprobacion Final","type":"approval","order":6,"hours":1}],"checklists":[{"name":"Material Comercial","items":["Presentaciones","Catalogo","Tarifario"]},{"name":"Accesos","items":["CRM","LinkedIn Sales","Territorio asignado"]}]}'
WHERE NOT EXISTS (SELECT 1 FROM flow_templates WHERE name = 'Onboarding Comercial');

INSERT INTO template_categories (name, description, icon, sort_order)
SELECT 'Presentaciones', 'Templates de presentaciones corporativas', 'presentation', 1
WHERE NOT EXISTS (SELECT 1 FROM template_categories WHERE name = 'Presentaciones');

INSERT INTO template_categories (name, description, icon, sort_order)
SELECT 'Documentos', 'Documentos de proceso y procedimientos', 'file-text', 2
WHERE NOT EXISTS (SELECT 1 FROM template_categories WHERE name = 'Documentos');

INSERT INTO template_categories (name, description, icon, sort_order)
SELECT 'Plantillas', 'Plantillas de formularios y reportes', 'layout', 3
WHERE NOT EXISTS (SELECT 1 FROM template_categories WHERE name = 'Plantillas');

INSERT INTO template_categories (name, description, icon, sort_order)
SELECT 'Manuales', 'Manuales de usuario y guias', 'book', 4
WHERE NOT EXISTS (SELECT 1 FROM template_categories WHERE name = 'Manuales');

INSERT INTO template_categories (name, description, icon, sort_order)
SELECT 'Politicas', 'Politicas y normativas internas', 'shield', 5
WHERE NOT EXISTS (SELECT 1 FROM template_categories WHERE name = 'Politicas');
