import { CorsOptions } from 'cors';
import { HelmetOptions } from 'helmet';

export function getAllowedOrigins(): string[] {
  const configured = [
    process.env.APP_ORIGIN,
    ...(process.env.ALLOWED_ORIGINS || '').split(','),
  ]
    .map((origin) => origin?.trim())
    .filter((origin): origin is string => Boolean(origin));

  return Array.from(new Set(configured));
}

export function getCorsOptions(): CorsOptions {
  const allowedOrigins = getAllowedOrigins();

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
  };
}

export function getHelmetOptions(): HelmetOptions {
  const allowedOrigins = getAllowedOrigins();
  const connectSrc = ["'self'", ...allowedOrigins];

  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
          'https://cdn.tailwindcss.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: [
          "'self'",
          'data:',
          'https://api.qrserver.com',
          'https://lh3.googleusercontent.com',
        ],
        connectSrc,
      },
    },
  };
}
