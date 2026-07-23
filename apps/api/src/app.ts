import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env, isProd } from './config/env.js';
import { logger } from './lib/logger.js';
import { apiRouter } from './routes.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { mountSpa } from './lib/serveSpa.js';

/** Paths (under /api/v1) exempt from CSRF — they bootstrap/rotate the token. */
const CSRF_EXEMPT = ['/api/v1/auth/login', '/api/v1/auth/refresh'];

/**
 * Dev-only CORS: when the Vite dev server runs on its own origin we must allow
 * credentialed requests through. In production everything is same-origin (the
 * SPA is served by this same server) so no CORS is needed.
 */
function devCors(): RequestHandler {
  const origin = env.WEB_ORIGIN;
  return (req, res, next) => {
    if (origin && !isProd) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Headers', 'Content-Type, x-csrf-token');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
    }
    next();
  };
}

export function createApp(): Express {
  const app = express();

  // Correct client IPs + secure cookies behind Railway's proxy.
  app.set('trust proxy', 1);

  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(compression());
  app.use(devCors());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(csrfProtection(CSRF_EXEMPT));

  // API first, so the SPA fallback never shadows it.
  app.use('/api/v1', apiRouter());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Unmatched API routes -> JSON 404 (registered before the SPA fallback).
  app.use('/api', notFoundHandler);

  // Static SPA + client-routing fallback (no-op in dev when dist is absent).
  mountSpa(app);

  app.use(errorHandler);
  return app;
}
