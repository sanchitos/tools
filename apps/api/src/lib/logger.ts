import { pino, type LoggerOptions } from 'pino';
import { env, isProd } from '../config/env.js';

const base: LoggerOptions = {
  level: env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug',
};

/**
 * Pretty logs in dev, JSON in prod. `pino-pretty` is a devDependency and is
 * pruned from production images, so we only reach for it outside prod — and even
 * then fall back to plain JSON if it can't be resolved, so a misconfigured
 * NODE_ENV (e.g. a non-Dockerfile deploy) degrades gracefully instead of
 * crash-looping on transport setup.
 */
function buildLogger() {
  if (isProd) return pino(base);
  try {
    return pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: true,
        },
      },
    });
  } catch {
    // pino-pretty unavailable (prod-only deps) — plain JSON is fine.
    return pino(base);
  }
}

export const logger = buildLogger();
