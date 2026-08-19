FROM oven/bun:1.3.14-alpine AS base

WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN mkdir -p apps/web apps/orchestrator apps/host-agent \
  packages/contracts packages/database packages/codex-adapter packages/workspace-runtime \
  packages/git packages/github packages/logger packages/security packages/ui packages/config
COPY apps/web/package.json apps/web/package.json
COPY apps/orchestrator/package.json apps/orchestrator/package.json
COPY apps/host-agent/package.json apps/host-agent/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/codex-adapter/package.json packages/codex-adapter/package.json
COPY packages/workspace-runtime/package.json packages/workspace-runtime/package.json
COPY packages/git/package.json packages/git/package.json
COPY packages/github/package.json packages/github/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/security/package.json packages/security/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/config/package.json packages/config/package.json
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "start:web"]
