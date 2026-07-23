# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Tools Jamaica — single-service image. Express serves the built SPA and the API
# under /api/v1 on one Railway service. Multi-stage: build web + api, then ship a
# lean production runtime.
# ---------------------------------------------------------------------------

# --- Build stage -----------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Install deps first (better layer caching). Copy every workspace manifest.
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci

# Build the SPA then the API (tsc -> apps/api/dist, vite -> apps/web/dist).
COPY . .
RUN npm run build

# Drop dev dependencies so only runtime deps ship.
RUN npm prune --omit=dev

# --- Runtime stage ---------------------------------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

# Run as the built-in unprivileged user.
USER node

# Railway injects PORT; the server binds 0.0.0.0:$PORT. EXPOSE is documentation.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" || exit 1

CMD ["node", "apps/api/dist/index.js"]
