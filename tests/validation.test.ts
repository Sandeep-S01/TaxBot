import { describe, expect, it } from 'vitest';
import {
  isStrongPassword,
  isValidEmail,
  isValidPeriod,
  isUuid,
  normalizeEmail,
  normalizeGstin,
  normalizeIndianPhone,
  normalizeReportType,
  parsePagination,
} from '../src/utils/validation';

describe('request validation helpers', () => {
  it('normalizes and validates email addresses', () => {
    expect(normalizeEmail(' CA@Example.COM ')).toBe('ca@example.com');
    expect(isValidEmail('ca@example.com')).toBe(true);
    expect(isValidEmail('not-email')).toBe(false);
  });

  it('enforces a minimum password policy', () => {
    expect(isStrongPassword('securepass123')).toBe(true);
    expect(isStrongPassword('short1')).toBe(false);
    expect(isStrongPassword('onlyletters')).toBe(false);
  });

  it('normalizes Indian mobile numbers and GSTIN values', () => {
    expect(normalizeIndianPhone('98765 43210')).toBe('919876543210');
    expect(normalizeIndianPhone('12345')).toBeNull();
    expect(normalizeGstin('29abcde1234f1z5')).toBe('29ABCDE1234F1Z5');
    expect(normalizeGstin('bad-gstin')).toBeNull();
  });

  it('validates UUIDs, periods, and report types', () => {
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isValidPeriod('2026-07')).toBe(true);
    expect(isValidPeriod('2026-13')).toBe(false);
    expect(normalizeReportType(' GST ')).toBe('gst');
    expect(normalizeReportType('trial')).toBeNull();
  });

  it('parses bounded pagination parameters', () => {
    expect(parsePagination({}, { defaultLimit: 200, maxLimit: 1000 })).toEqual({ limit: 200, offset: 0 });
    expect(parsePagination({ limit: '50', offset: '10' }, { defaultLimit: 200, maxLimit: 1000 })).toEqual({ limit: 50, offset: 10 });
    expect(parsePagination({ limit: '1001' }, { defaultLimit: 200, maxLimit: 1000 })).toBeNull();
    expect(parsePagination({ limit: '0' }, { defaultLimit: 200, maxLimit: 1000 })).toBeNull();
    expect(parsePagination({ offset: '-1' }, { defaultLimit: 200, maxLimit: 1000 })).toBeNull();
    expect(parsePagination({ limit: '10.5' }, { defaultLimit: 200, maxLimit: 1000 })).toBeNull();
  });
});
