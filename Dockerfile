# syntax=docker/dockerfile:1

##########################################################################
# base: OS deps shared by every stage — Node (from the base image),
# LibreOffice (legacy xlsx report templates), and uv (manages its own
# Python 3.13 install so we don't depend on Debian's system Python).
##########################################################################
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice \
      fonts-dejavu-core \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV UV_INSTALL_DIR=/usr/local/bin
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
WORKDIR /app

##########################################################################
# pydeps: resolve the Python 3.13 venv (matplotlib/pandas/numpy for the
# report engine) from pyproject.toml/uv.lock, isolated from the JS build.
##########################################################################
FROM base AS pydeps
COPY pyproject.toml uv.lock ./
RUN uv python install 3.13 && uv sync --no-dev

##########################################################################
# jsbuild: install the npm workspace and run the esbuild production build.
##########################################################################
FROM base AS jsbuild
COPY package.json package-lock.json ./
COPY lib ./lib
COPY artifacts ./artifacts
COPY scripts ./scripts
COPY attached_assets ./attached_assets
RUN npm ci
RUN npm run build --workspace=@workspace/api-server
RUN npm prune --omit=dev

##########################################################################
# runtime: the actual image that ships.
##########################################################################
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Compiled server + pruned production node_modules (root + workspace).
COPY --from=jsbuild /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=jsbuild /app/node_modules ./node_modules
COPY --from=jsbuild /app/lib ./lib

# uv-managed Python venv with matplotlib/pandas/numpy; put it first on PATH
# so the app's plain `spawn("python3", ...)` calls resolve to it.
COPY --from=pydeps /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:${PATH}"

EXPOSE 3000
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
