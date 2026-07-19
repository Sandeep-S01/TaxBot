import { describe, expect, it } from 'vitest';
import { isUsableAnthropicKey, shouldUseSimulatedAuditResponse } from '../src/ai/auditAvailability';

describe('AI audit availability', () => {
  it('rejects missing or placeholder Anthropic keys', () => {
    expect(isUsableAnthropicKey(undefined)).toBe(false);
    expect(isUsableAnthropicKey('placeholder-key')).toBe(false);
    expect(isUsableAnthropicKey('your_anthropic_key')).toBe(false);
    expect(isUsableAnthropicKey('short')).toBe(false);
  });

  it('accepts long non-placeholder Anthropic keys', () => {
    expect(isUsableAnthropicKey('sk-ant-valid-key-that-is-long-enough')).toBe(true);
  });

  it('allows simulated audit responses only outside production', () => {
    expect(shouldUseSimulatedAuditResponse(undefined, 'development')).toBe(true);
    expect(shouldUseSimulatedAuditResponse(undefined, 'test')).toBe(true);
    expect(shouldUseSimulatedAuditResponse(undefined, 'production')).toBe(false);
    expect(shouldUseSimulatedAuditResponse('sk-ant-valid-key-that-is-long-enough', 'development')).toBe(false);
  });
});
