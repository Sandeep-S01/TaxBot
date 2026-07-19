import { Server } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGracefulShutdown, shouldTrustProxy } from '../src/runtime/serverLifecycle';

describe('Server lifecycle helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('trusts reverse proxy headers only in production', () => {
    expect(shouldTrustProxy('production')).toBe(true);
    expect(shouldTrustProxy('development')).toBe(false);
    expect(shouldTrustProxy('test')).toBe(false);
  });

  it('registers SIGTERM and SIGINT shutdown handlers', () => {
    const onceSpy = vi.spyOn(process, 'once').mockImplementation(() => process);
    const server = { close: vi.fn() } as unknown as Server;

    registerGracefulShutdown(server);

    expect(onceSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(onceSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });
});
