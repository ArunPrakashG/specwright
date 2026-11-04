# One image per role, both built from the workspace source.
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS web
RUN pnpm --filter @specwright/web build
ENV NODE_ENV=production
EXPOSE 3100
CMD ["pnpm", "--filter", "@specwright/web", "start"]

FROM base AS worker
# unzip unpacks the WooCommerce plugin for previews.
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
RUN pnpm --filter @specwright/checks exec playwright install --with-deps chromium
CMD ["node", "packages/cli/bin/specwright.js", "worker"]
