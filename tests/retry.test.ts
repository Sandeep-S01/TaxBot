import { describe, expect, it, vi } from 'vitest';
import { isRetriableHttpError, withRetry } from '../src/utils/retry';

describe('retry helper', () => {
  it('retries failed operations and eventually resolves', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('ok');

    await expect(withRetry(operation, { attempts: 2, baseDelayMs: 1 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retriable errors', async () => {
    const operation = vi.fn().mockRejectedValue({ response: { status: 400 } });

    await expect(withRetry(operation, {
      attempts: 3,
      baseDelayMs: 1,
      shouldRetry: isRetriableHttpError,
    })).rejects.toMatchObject({ response: { status: 400 } });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('classifies timeout/network, 429, and 5xx errors as retriable', () => {
    expect(isRetriableHttpError(new Error('timeout'))).toBe(true);
    expect(isRetriableHttpError({ response: { status: 429 } })).toBe(true);
    expect(isRetriableHttpError({ response: { status: 503 } })).toBe(true);
    expect(isRetriableHttpError({ response: { status: 401 } })).toBe(false);
  });
});
