-- Migration: whatsapp_queue table
-- Stores outgoing WhatsApp messages for batched, reliable delivery.
-- Processed by:
--   1. Supabase DB webhook → POST /api/webhooks/whatsapp-queue (primary)
--   2. Vercel cron /api/cron/process-whatsapp-queue (fallback, every 1 min)

CREATE TABLE IF NOT EXISTS whatsapp_queue (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID REFERENCES tickets(id) ON DELETE SET NULL,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone        TEXT NOT NULL,
    message      TEXT NOT NULL,
    media_url    TEXT,
    media_type   TEXT CHECK (media_type IN ('image', 'video')),
    event_type   TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    retry_count  INT NOT NULL DEFAULT 0,
    error        TEXT,
    sent_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the cron/webhook to quickly fetch pending messages
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status ON whatsapp_queue (status, created_at);

-- Index for per-ticket lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_ticket ON whatsapp_queue (ticket_id);

-- Enable Row Level Security (service role bypasses this)
ALTER TABLE whatsapp_queue ENABLE ROW LEVEL SECURITY;
