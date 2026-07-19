import { describe, expect, it } from 'vitest';
import { normalizeAuditActionPayload } from '../src/audit/validation';

describe('Audit action payload validation', () => {
  it('normalizes a valid manual audit action', () => {
    const result = normalizeAuditActionPayload({
      actionType: 'TRANSACTION_APPROVED',
      description: ' Approved a reviewed transaction ',
      clientId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      actionType: 'TRANSACTION_APPROVED',
      description: 'Approved a reviewed transaction',
      clientId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('rejects unsafe action types and invalid client ids', () => {
    expect(normalizeAuditActionPayload({
      actionType: '<script>',
      description: 'bad',
    }).error).toBe('Invalid actionType format');

    expect(normalizeAuditActionPayload({
      actionType: 'CLIENT_CREATED',
      description: 'bad client',
      clientId: 'not-a-uuid',
    }).error).toBe('Invalid client id');
  });

  it('rejects missing or oversized descriptions', () => {
    expect(normalizeAuditActionPayload({
      actionType: 'CLIENT_CREATED',
      description: '',
    }).error).toBe('Missing required parameters: actionType and description');

    expect(normalizeAuditActionPayload({
      actionType: 'CLIENT_CREATED',
      description: 'x'.repeat(501),
    }).error).toBe('Description must be 500 characters or fewer');
  });
});
