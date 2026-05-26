-- Enable UUID generation extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Clients Table
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

-- Trigger to update updated_at on client change
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

-- 2. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    description TEXT,
    vendor_name TEXT,
    amount NUMERIC(12,2) NOT NULL, -- excluding tax
    tax_amount NUMERIC(12,2) DEFAULT 0.00,
    category TEXT NOT NULL CHECK (category IN ('sales', 'purchase', 'expense', 'salary', 'other')),
    gst_category TEXT CHECK (gst_category IN ('B2B', 'B2C', 'B2CL', 'exempt', 'nil_rated')),
    gst_rate NUMERIC(5,2) DEFAULT 0.00 CHECK (gst_rate IN (0, 5, 12, 18, 28)),
    hsn_sac TEXT,
    invoice_number TEXT,
    source TEXT NOT NULL CHECK (source IN ('whatsapp_image', 'whatsapp_text', 'whatsapp_pdf', 'manual')),
    raw_text TEXT,
    confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. GST Returns Table
CREATE TABLE IF NOT EXISTS gst_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    return_type TEXT NOT NULL CHECK (return_type IN ('GSTR-1', 'GSTR-3B')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_signature', 'filed')),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    filed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (client_id, period, return_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_client_date ON transactions(client_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_gst_returns_lookup ON gst_returns(client_id, period, return_type);

-- Row-Level Security (RLS) Setup
-- Since this is an backend-orchestrated service using the service_role key, we enable RLS but configure policies
-- if clients access it directly, or default to admin access.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_returns ENABLE ROW LEVEL SECURITY;

-- Allow full access to service role / service account
CREATE POLICY "Allow all access to service_role" ON clients TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON transactions TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to service_role" ON gst_returns TO service_role USING (true) WITH CHECK (true);
