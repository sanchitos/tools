import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

const app = createApp();

const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(`API listening on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
});

/** Graceful shutdown so Railway rollovers don't drop in-flight requests. */
function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down`);
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
    logger.info('Server closed');
    process.exit(0);
  });
  // Failsafe if connections hang.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
