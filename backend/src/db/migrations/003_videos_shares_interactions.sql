-- =============================================================================
-- 003_videos_shares_interactions.sql
-- Videos, links de compartición e interacciones de usuario.
--
-- ⚠️ RECONSTRUCCIÓN INVERSA desde las queries de backend/src/routes/
-- (videos.ts, videos-upload.ts, video-interactions.ts, comments.ts).
-- Validar contra la base de producción antes de aplicar en cualquier entorno.
-- =============================================================================

CREATE TABLE IF NOT EXISTS videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    content_id UUID REFERENCES contents(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    storage_key TEXT NOT NULL,
    thumbnail_url TEXT,
    transcript TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}',
    -- Estados observados en código: 'processing', 'transcribing', 'ready', 'failed'
    status VARCHAR(50) NOT NULL DEFAULT 'processing',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_org ON videos (org_id);
CREATE INDEX IF NOT EXISTS idx_videos_content ON videos (content_id);
CREATE INDEX IF NOT EXISTS idx_videos_storage_key ON videos (storage_key);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos (status);

CREATE TABLE IF NOT EXISTS video_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    share_token VARCHAR(64) UNIQUE NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    password_hash VARCHAR(255),
    allowed_emails JSONB,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_shares_token ON video_shares (share_token);
CREATE INDEX IF NOT EXISTS idx_video_shares_video ON video_shares (video_id);

CREATE TABLE IF NOT EXISTS video_share_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES video_shares(id) ON DELETE CASCADE,
    ip_address VARCHAR(64),
    user_agent TEXT,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_share_views_share ON video_share_views (share_id);

CREATE TABLE IF NOT EXISTS video_likes (
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (video_id, user_id)
);

CREATE TABLE IF NOT EXISTS video_bookmarks (
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (video_id, user_id)
);

CREATE TABLE IF NOT EXISTS video_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    timestamp_seconds NUMERIC(10, 2),
    parent_id UUID REFERENCES video_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_comments_video ON video_comments (video_id);
