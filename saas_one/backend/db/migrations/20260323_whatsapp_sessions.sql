-- Migration: Create whatsapp_sessions table for multi-property poll flow
-- Required for users with multiple properties to select which property
-- their WhatsApp request is for.

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL DEFAULT 'awaiting_property',
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pending_text TEXT,
    pending_media_url TEXT,
    pending_media_key TEXT,
    pending_video_url TEXT,
    pending_video_key TEXT,
    pending_is_image BOOLEAN DEFAULT FALSE,
    pending_is_video BOOLEAN DEFAULT FALSE,
    property_options JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone ON whatsapp_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_expires ON whatsapp_sessions(expires_at);
