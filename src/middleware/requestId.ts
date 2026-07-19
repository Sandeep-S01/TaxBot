import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const requestId = Array.isArray(incoming) ? incoming[0] : incoming || crypto.randomUUID();
  const startedAt = Date.now();

  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    console.log(JSON.stringify({
      event: 'http_request',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });

  next();
}

export function getRequestId(req: Request): string | null {
  return (req as any).requestId || null;
}
