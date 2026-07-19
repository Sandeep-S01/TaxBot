import { Server } from 'http';

export function shouldTrustProxy(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === 'production';
}

export function registerGracefulShutdown(server: Server, timeoutMs = 10000): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[Lifecycle] Received ${signal}. Closing HTTP server.`);

    const forceExit = setTimeout(() => {
      console.error(`[Lifecycle] Graceful shutdown timed out after ${timeoutMs}ms.`);
      process.exit(1);
    }, timeoutMs);
    forceExit.unref();

    server.close((err?: Error) => {
      clearTimeout(forceExit);
      if (err) {
        console.error('[Lifecycle] HTTP server close failed:', err.message);
        process.exit(1);
      }
      console.log('[Lifecycle] HTTP server closed.');
      process.exit(0);
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
