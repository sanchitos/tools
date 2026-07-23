import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@tools-jamaica/shared';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { isProd } from '../config/env.js';

/** 404 for any unmatched /api route (registered after the API routers). */
export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorBody = {
    error: { code: 'NOT_FOUND', message: 'Resource not found' },
  };
  res.status(404).json(body);
};

/** Central error normalizer — the only place that writes an error envelope. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.status).json(body);
    return;
  }

  // Malformed JSON from express.json() -> 400 rather than a generic 500.
  if (err instanceof SyntaxError && 'body' in err) {
    const body: ApiErrorBody = {
      error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.flatten(),
      },
    };
    res.status(400).json(body);
    return;
  }

  logger.error({ err }, 'Unhandled error');
  const body: ApiErrorBody = {
    error: {
      code: 'INTERNAL',
      message: isProd ? 'Internal server error' : String((err as Error)?.message ?? err),
    },
  };
  res.status(500).json(body);
};
