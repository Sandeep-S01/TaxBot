import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Supabase schema and migrations', () => {
  it('keeps the consolidated schema aligned with current production tables and audit guards', () => {
    const schema = read('supabase/schema.sql');

    expect(schema).toContain('CREATE TABLE IF NOT EXISTS inbound_messages');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS console_audit_logs');
    expect(schema).toContain('CONSTRAINT console_audit_logs_action_type_format');
    expect(schema).toContain('CREATE OR REPLACE FUNCTION enforce_console_audit_log_client_scope');
    expect(schema).toContain('DROP POLICY IF EXISTS "Allow all access to service_role" ON clients');
  });

  it('uses idempotent DO blocks for the audit integrity migration constraints', () => {
    const migration = read('supabase/migrations/004_audit_log_integrity.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION enforce_console_audit_log_client_scope');
    expect(migration).toContain('DROP TRIGGER IF EXISTS enforce_console_audit_log_client_scope_trigger');
    expect(migration).toMatch(/SELECT\s+1\s+FROM\s+pg_constraint/);
    expect(migration).not.toContain('ADD CONSTRAINT IF NOT EXISTS');
  });
});
