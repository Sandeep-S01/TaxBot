-- Query performance indexes for production ledger, sync, and audit paths.
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_transactions_client_created_at
  ON transactions(client_id, created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_date_client
  ON transactions(date DESC, client_id);

CREATE INDEX IF NOT EXISTS idx_console_audit_logs_ca_created_at
  ON console_audit_logs(ca_id, created_at DESC);
