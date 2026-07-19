import { describe, expect, it } from 'vitest';
import { isValidEmailWebhookSecret } from '../src/webhook/emailAuth';

describe('Email webhook shared-secret verification', () => {
  const configuredSecret = 'email_webhook_secret_32_chars_minimum';

  it('accepts the exact configured secret', () => {
    expect(isValidEmailWebhookSecret(configuredSecret, configuredSecret)).toBe(true);
  });

  it('rejects missing or incorrect secrets', () => {
    expect(isValidEmailWebhookSecret(undefined, configuredSecret)).toBe(false);
    expect(isValidEmailWebhookSecret('', configuredSecret)).toBe(false);
    expect(isValidEmailWebhookSecret('wrong_secret', configuredSecret)).toBe(false);
    expect(isValidEmailWebhookSecret(configuredSecret, undefined)).toBe(false);
  });
});
