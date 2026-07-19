-- Durable inbound WhatsApp message tracking for idempotency and retry visibility.

CREATE TABLE IF NOT EXISTS inbound_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meta_message_id TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'document', 'audio', 'interactive', 'unsupported')),
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'duplicate')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ
);

ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_inbound_messages_status_created ON inbound_messages(status, created_at);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_phone_created ON inbound_messages(phone, created_at DESC);

DROP POLICY IF EXISTS "Allow all access to service_role" ON inbound_messages;
CREATE POLICY "Allow all access to service_role" ON inbound_messages TO service_role USING (true) WITH CHECK (true);
