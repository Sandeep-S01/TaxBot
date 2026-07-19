-- Harden CA audit log integrity for existing Supabase projects.
-- Safe to run repeatedly.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'console_audit_logs_action_type_format'
      AND conrelid = 'console_audit_logs'::regclass
  ) THEN
    ALTER TABLE console_audit_logs
      ADD CONSTRAINT console_audit_logs_action_type_format
      CHECK (action_type ~ '^[A-Z0-9_:-]{1,64}$') NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'console_audit_logs_description_length'
      AND conrelid = 'console_audit_logs'::regclass
  ) THEN
    ALTER TABLE console_audit_logs
      ADD CONSTRAINT console_audit_logs_description_length
      CHECK (length(btrim(description)) BETWEEN 1 AND 500) NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_console_audit_log_client_scope()
RETURNS TRIGGER AS $$
DECLARE
  managed_ca_id UUID;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ca_id INTO managed_ca_id
  FROM clients
  WHERE id = NEW.client_id;

  IF managed_ca_id IS NULL OR managed_ca_id <> NEW.ca_id THEN
    RAISE EXCEPTION 'console_audit_logs client_id is not managed by ca_id'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_console_audit_log_client_scope_trigger ON console_audit_logs;
CREATE TRIGGER enforce_console_audit_log_client_scope_trigger
BEFORE INSERT OR UPDATE OF ca_id, client_id ON console_audit_logs
FOR EACH ROW
EXECUTE FUNCTION enforce_console_audit_log_client_scope();
