-- =============================================================================
-- 001_core_orgs_users.sql
-- Núcleo multi-tenant: organizaciones, usuarios y membresías.
--
-- ⚠️ RECONSTRUCCIÓN INVERSA desde las queries de backend/src/routes/.
-- Validar contra la base de producción antes de aplicar en cualquier entorno.
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    -- El código usa roles: 'viewer', 'admin', 'owner', 'employee' (auth.ts, users.ts).
    -- Sin CHECK para no rechazar valores existentes en producción.
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    department VARCHAR(100),
    position VARCHAR(100),
    avatar_url TEXT,
    hire_date DATE,
    last_login TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_department ON users (department);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users (last_login);

CREATE TABLE IF NOT EXISTS org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- Roles de organización usados en código: 'viewer', 'member', 'admin', 'owner'
    org_role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members (org_id);
