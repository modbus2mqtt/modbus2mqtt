# Multi-stage build for the modbus2mqtt fork.
#
# Stage 1 compiles backend (tsc) + frontend (Angular) in the pnpm monorepo.
# Stage 2 installs the backend's production dependencies with npm (flat,
# real files — required because the compiled code imports 'serialport',
# a native-binding package that must be resolvable at /app/node_modules).
# pnpm's isolated/symlinked store is NOT copied to runtime (broken).

# ---- stage 1: build ----
FROM node:22-alpine AS build
WORKDIR /src

RUN apk add --no-cache git jq
RUN corepack enable

# Layer-cache friendly: copy manifests first (incl. per-package lockfiles)
COPY package.json pnpm-lock.yaml .npmrc .nvmrc ./
COPY backend/package.json backend/pnpm-lock.yaml backend/
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/

RUN pnpm install --frozen-lockfile
RUN cd backend && pnpm install --frozen-lockfile
RUN cd frontend && pnpm install --frozen-lockfile

# Source
COPY . .

# Build backend (tsc) + frontend (Angular)
RUN pnpm run build

# ---- stage 2: runtime ----
FROM node:22-alpine AS runtime
RUN apk add --no-cache tzdata git jq
ENV TZ=Europe/London
WORKDIR /app

# Fresh flat production install of the backend deps (includes serialport
# + its native bindings, compiled for the target arch at build time).
COPY backend/package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund

# Compiled app + static frontend
COPY --from=build /src/dist /app/dist
COPY --from=build /src/docker/rootfs /app/rootfs

ENV NODE_ENV=production

# /data is the single persistent share: configuration (/data/modbus2mqtt)
# AND public specifications (/data/public) survive container recreation.
RUN mkdir -p /data /ssl && chown -R node:node /data /ssl && chmod -R 755 /data /ssl

# Health check
HEALTHCHECK --interval=5s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q --tries=1 -O /dev/null http://127.0.0.1:3000/index.html || exit 1

EXPOSE 3000 3443

CMD ["node", "dist/server/modbus2mqtt.js", "-c", "/data", "-d", "/data", "-s", "/ssl"]
