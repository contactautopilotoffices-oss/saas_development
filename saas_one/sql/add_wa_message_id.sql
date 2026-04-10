-- Add WhatsApp message ID column for idempotency
ALTER TABLE tickets 
    ADD COLUMN IF NOT EXISTS wa_message_id text UNIQUE;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tickets_wa_message_id ON tickets(wa_message_id);
