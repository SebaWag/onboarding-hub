-- =============================================================================
-- 007_video_zoom.sql
-- Auto-zoom: telemetría de cursor + regiones de zoom por video.
--
-- - video_cursor_telemetry: 1 fila por video con los samples del cursor (JSONB).
-- - video_zoom_regions: N filas por video (regiones editables).
-- =============================================================================

CREATE TABLE IF NOT EXISTS video_cursor_telemetry (
    video_id UUID PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
    -- Array de { timeMs, cx, cy, interactionType?, cursorType? } comprimido.
    samples JSONB NOT NULL DEFAULT '[]',
    sample_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_zoom_regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    -- Identificador lógico del cliente (p.ej. "zoom-auto-1"), estable para edición.
    region_key VARCHAR(64) NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    -- Profundidad 1..6 (escala = ZOOM_DEPTH_SCALES[depth]); 2 = auto por defecto.
    depth SMALLINT NOT NULL DEFAULT 2,
    focus_x DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    focus_y DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    mode VARCHAR(16) NOT NULL DEFAULT 'auto',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT video_zoom_regions_key_unique UNIQUE (video_id, region_key),
    CONSTRAINT video_zoom_regions_range_valid CHECK (end_ms >= start_ms),
    CONSTRAINT video_zoom_regions_depth_valid CHECK (depth BETWEEN 1 AND 6)
);

CREATE INDEX IF NOT EXISTS idx_video_zoom_regions_video
    ON video_zoom_regions (video_id, sort_order, start_ms);
