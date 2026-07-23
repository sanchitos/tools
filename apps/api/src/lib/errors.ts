import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Typed application error. Handlers throw these; the central errorHandler
 * normalizes them into the `{ error: { code, message, details? } }` envelope.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static BadRequest(message = 'Bad request', details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
  static Unauthorized(message = 'Unauthorized', details?: unknown) {
    return new AppError(401, 'UNAUTHORIZED', message, details);
  }
  static Forbidden(message = 'Forbidden', details?: unknown) {
    return new AppError(403, 'FORBIDDEN', message, details);
  }
  static NotFound(message = 'Not found', details?: unknown) {
    return new AppError(404, 'NOT_FOUND', message, details);
  }
  static Conflict(message = 'Conflict', details?: unknown) {
    return new AppError(409, 'CONFLICT', message, details);
  }
  static Internal(message = 'Internal server error', details?: unknown) {
    return new AppError(500, 'INTERNAL', message, details);
  }
}

/**
 * Wrap an async route handler so thrown errors / rejected promises reach the
 * Express error middleware instead of crashing the process.
 */
export function ah(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
