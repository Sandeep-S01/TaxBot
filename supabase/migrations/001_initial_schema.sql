-- TaxBot baseline schema for new Supabase projects.
-- For existing projects, run later migrations in order instead of rerunning supabase/schema.sql.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    business_name TEXT,
    gstin TEXT,
    gst_registered BOOLEAN DEFAULT FALSE,
    plan TEXT DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'pro')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_clients_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS cas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    firm_name TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    description TEXT,
    vendor_name TEXT,
    amount NUMERIC(12,2) NOT NULL,
    tax_amount NUMERIC(12,2) DEFAULT 0.00,
    category TEXT NOT NULL CHECK (category IN ('sales', 'purchase', 'expense', 'salary', 'other')),
    gst_category TEXT CHECK (gst_category IN ('B2B', 'B2C', 'B2CL', 'exempt', 'nil_rated')),
    gst_rate NUMERIC(5,2) DEFAULT 0.00 CHECK (gst_rate IN (0, 5, 12, 18, 28)),
    hsn_sac TEXT,
    invoice_number TEXT,
    vendor_gstin TEXT,
    source TEXT NOT NULL CHECK (source IN ('whatsapp_image', 'whatsapp_text', 'whatsapp_pdf', 'manual')),
    raw_text TEXT,
    confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'needs_review', 'rejected')),
    review_reason TEXT,
    confirmed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gst_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL,
    return_type TEXT NOT NULL CHECK (return_type IN ('GSTR-1', 'GSTR-3B')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_signature', 'filed')),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    filed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (client_id, period, return_type)
);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS ca_id UUID REFERENCES cas(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS console_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ca_id UUID NOT NULL REFERENCES cas(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

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

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cas ENABLE ROW LEVEL SECURITY;
ALTER TABLE console_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_clients_ca_id ON clients(ca_id);
CREATE INDEX IF NOT EXISTS idx_transactions_client_date ON transactions(client_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_client_status_date ON transactions(client_id, status, date);
CREATE INDEX IF NOT EXISTS idx_transactions_duplicate_lookup ON transactions(client_id, invoice_number, vendor_gstin, vendor_name, date, amount, tax_amount);
CREATE INDEX IF NOT EXISTS idx_gst_returns_lookup ON gst_returns(client_id, period, return_type);
CREATE INDEX IF NOT EXISTS idx_console_audit_logs_ca_id ON console_audit_logs(ca_id);
CREATE INDEX IF NOT EXISTS idx_console_audit_logs_client_id ON console_audit_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_console_audit_logs_created_at ON console_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_status_created ON inbound_messages(status, created_at);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_phone_created ON inbound_messages(phone, created_at DESC);

DROP POLICY IF EXISTS "Allow all access to service_role" ON clients;
DROP POLICY IF EXISTS "Allow all access to service_role" ON transactions;
DROP POLICY IF EXISTS "Allow all access to service_role" ON gst_returns;
DROP POLICY IF EXISTS "Allow all access to service_role" ON cas;
DROP POLICY IF EXISTS "Allow all access to service_role" ON console_audit_logs;
DROP POLICY IF EXISTS "Allow all access to service_role" ON inbound_messages;

CREATE POLICY "Allow all access to service_role" ON clients TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON transactions TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON gst_returns TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON cas TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON console_audit_logs TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON inbound_messages TO service_role USING (true) WITH CHECK (true);
