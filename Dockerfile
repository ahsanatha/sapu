FROM node:22.14.0-slim AS builder

# Build-time variables for Admin UI authentication and API origin
# Vite only exposes variables prefixed with VITE_ to the frontend bundle
ARG VITE_ADMIN_PASSWORD
ARG VITE_API_ORIGIN

WORKDIR /app

# Prepare pnpm and install workspace deps with cache-friendly copies
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY web/package.json ./web/package.json
COPY admin/package.json ./admin/package.json

# Copy full source
COPY . .

# Copy all static assets from admin/public into the build context
COPY admin/public ./admin/public

# Build server and web assets
# Ensure Vite sees VITE_* envs during Admin build
ENV VITE_ADMIN_PASSWORD=${VITE_ADMIN_PASSWORD}
ENV VITE_API_ORIGIN=${VITE_API_ORIGIN}
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate \
  && pnpm -w install --no-frozen-lockfile \
  && pnpm -w --filter ./web install --no-frozen-lockfile \
  && pnpm -w --filter ./admin install --no-frozen-lockfile \
  && pnpm run build \
  && pnpm -w --filter ./web run build \
  && pnpm -w --filter ./admin run build \
  && mkdir -p public/admin \
  && cp -r admin/dist/. public/admin/ \
  && cp schema.sql dist/schema.sql

FROM node:22.14.0-slim AS runtime

# Runtime variables for Admin auth
# VITE_ADMIN_PASSWORD is used by the frontend at build-time
# ADMIN_PASSWORD is used by the Node server at runtime
ARG VITE_ADMIN_PASSWORD
ARG ADMIN_PASSWORD

# Install Chromium for Puppeteer (Debian-based) and certificates/fonts
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation && \
    rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install production dependencies only (pnpm)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
ENV NODE_ENV=production
# Ensure runtime has a non-empty admin secret
# Prefer ADMIN_PASSWORD if provided, otherwise fallback to VITE_ADMIN_PASSWORD
ENV ADMIN_PASSWORD=${ADMIN_PASSWORD:-${VITE_ADMIN_PASSWORD}}
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate && pnpm install --prod --no-frozen-lockfile

# Copy built outputs with non-root ownership
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/public ./dist/public
COPY --chown=node:node --from=builder /app/config ./config

# Expose port
EXPOSE 3000

# Run as non-root user
USER node
# Start application with DB init
CMD ["sh", "-lc", "node dist/core/tools/init-db.js && node dist/apis/server.js"]
ENV FILE_CONFIG_DIR=/app/config/sites
