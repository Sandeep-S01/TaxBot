import { describe, it, expect } from 'vitest';
import { validateGstinFormat } from '../src/gst/sandbox';

describe('GSTIN Format Validation', () => {
  it('should validate correct GSTIN formats', () => {
    // 29 = State Code (Karnataka), ABCDE1234F = PAN, 1 = Entity code, Z = Checksum placeholder, 5 = Checksum
    expect(validateGstinFormat('29ABCDE1234F1Z5')).toBe(true);
    expect(validateGstinFormat('07AAAAA1111A1Z1')).toBe(true);
  });

  it('should reject incorrect GSTIN lengths or characters', () => {
    expect(validateGstinFormat('29ABCDE1234F1Z')).toBe(false); // Too short (14 characters)
    expect(validateGstinFormat('29ABCDE1234F1Z56')).toBe(false); // Too long (16 characters)
    expect(validateGstinFormat('29ABCDE1234F1A5')).toBe(false); // No 'Z' character in the 14th slot
    expect(validateGstinFormat('XXABCDE1234F1Z5')).toBe(false); // Non-numeric state code
  });

  it('should handle lowercase inputs by trimming and converting in lookup (our checker is strict, so we clean it)', () => {
    // Check if the validation function itself is case-sensitive (it cleans in the API helper, but helper uses cleanGstin)
    // The validateGstinFormat handles uppercase internally via cleanGstin
    expect(validateGstinFormat('  29abcde1234f1z5  ')).toBe(true);
  });
});
