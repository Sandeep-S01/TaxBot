export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const shouldRetry = options.shouldRetry ?? (() => true);
  let lastError: any;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      if (attempt >= attempts || !shouldRetry(err)) {
        throw err;
      }
      options.onRetry?.(err, attempt);
      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError;
}

export function isRetriableHttpError(error: any): boolean {
  const status = error?.response?.status;
  if (!status) {
    return true;
  }
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
