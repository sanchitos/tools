import type { ProfileDTO } from '@tools-jamaica/shared';

/**
 * Express request augmentation. `requireAuth` populates `req.user` after
 * verifying the session cookie; downstream handlers read it type-safely.
 */
declare global {
  namespace Express {
    interface Request {
      user?: ProfileDTO;
    }
  }
}

export {};
