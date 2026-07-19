-- TaxBot production-readiness upgrade for existing Supabase projects.
-- Run once after older prototype schemas. Safe to run again because it uses IF EXISTS/IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS cas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    firm_name TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'needs_review', 'rejected'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cas ENABLE ROW LEVEL SECURITY;
ALTER TABLE console_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_clients_ca_id ON clients(ca_id);
CREATE INDEX IF NOT EXISTS idx_transactions_client_date ON transactions(client_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_client_status_date ON transactions(client_id, status, date);
CREATE INDEX IF NOT EXISTS idx_transactions_duplicate_lookup ON transactions(client_id, invoice_number, vendor_gstin, vendor_name, date, amount, tax_amount);
CREATE INDEX IF NOT EXISTS idx_console_audit_logs_ca_id ON console_audit_logs(ca_id);
CREATE INDEX IF NOT EXISTS idx_console_audit_logs_client_id ON console_audit_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_console_audit_logs_created_at ON console_audit_logs(created_at DESC);

DROP POLICY IF EXISTS "Allow all access to service_role" ON clients;
DROP POLICY IF EXISTS "Allow all access to service_role" ON transactions;
DROP POLICY IF EXISTS "Allow all access to service_role" ON gst_returns;
DROP POLICY IF EXISTS "Allow all access to service_role" ON cas;
DROP POLICY IF EXISTS "Allow all access to service_role" ON console_audit_logs;

CREATE POLICY "Allow all access to service_role" ON clients TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON transactions TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON gst_returns TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON cas TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON console_audit_logs TO service_role USING (true) WITH CHECK (true);
