# Build from the repo root: docker build -f apps/zalo-relay/Dockerfile .
# The root lockfile covers every workspace, so all workspace manifests are copied for npm ci.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/zalo-relay/package.json apps/zalo-relay/
RUN npm ci -w @fsl/zalo-relay --include-workspace-root --ignore-scripts
COPY apps/zalo-relay/ apps/zalo-relay/
RUN npm run build -w @fsl/zalo-relay

FROM node:24-alpine AS deps
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/apps/zalo-relay/package.json apps/zalo-relay/
RUN npm ci -w @fsl/zalo-relay --omit=dev --ignore-scripts

FROM node:24-alpine
ARG GIT_SHA=dev
ENV NODE_ENV=production RELAY_REVISION=$GIT_SHA
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/zalo-relay/package.json apps/zalo-relay/
COPY --from=build /app/apps/zalo-relay/dist apps/zalo-relay/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "apps/zalo-relay/dist/server.js"]
