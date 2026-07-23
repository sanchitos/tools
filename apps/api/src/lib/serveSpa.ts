import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type Express, type RequestHandler } from 'express';

/**
 * Isolated SPA-serving block. Kept in one module so the web/api split stays
 * clean: to run the SPA elsewhere (CDN), delete this + its two calls in app.ts.
 *
 * Serves the built Vite output and falls back to index.html for any non-API GET
 * so client-side routing works on deep links / refresh. Registered AFTER the API
 * routers and /health so it never shadows them.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// dist/lib/serveSpa.js -> apps/api -> apps/web/dist
const WEB_DIST = path.resolve(__dirname, '../../../web/dist');

export function spaExists(): boolean {
  return fs.existsSync(path.join(WEB_DIST, 'index.html'));
}

export function mountSpa(app: Express): void {
  if (!spaExists()) return; // dev: Vite serves the SPA on its own origin.

  app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));

  const fallback: RequestHandler = (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  };
  app.get('*', fallback);
}
