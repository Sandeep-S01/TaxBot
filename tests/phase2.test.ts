import { describe, it, expect } from 'vitest';
import { generateExportToken, validateExportToken } from '../src/handlers/commands/export';

describe('Phase 2: Secure Export Tokens & Interactive Logic', () => {
  it('should generate a secure export token and validate it successfully', () => {
    const clientId = 'test-client-123';
    const period = '2026-05';
    const todayStr = new Date().toISOString().split('T')[0];

    const token = generateExportToken(clientId, period, todayStr);
    expect(token).toBeDefined();
    expect(token.length).toBe(64); // SHA-256 hash size in hex

    // Validate the token
    const isValid = validateExportToken(clientId, period, token);
    expect(isValid).toBe(true);
  });

  it('should fail validation for expired or tampered tokens', () => {
    const clientId = 'test-client-123';
    const period = '2026-05';
    
    // Invalid token
    expect(validateExportToken(clientId, period, 'invalid-token-value')).toBe(false);

    // Mismatched client ID
    const todayStr = new Date().toISOString().split('T')[0];
    const correctToken = generateExportToken(clientId, period, todayStr);
    expect(validateExportToken('different-client-id', period, correctToken)).toBe(false);

    // Mismatched period
    expect(validateExportToken(clientId, '2026-06', correctToken)).toBe(false);
  });
});
