# syntax=docker/dockerfile:1

##########################################################################
# base: OS deps shared by every stage — Node (from the base image),
# fonts-dejavu-core (consistent text rendering in the matplotlib report
# engine), and uv (manages its own Python 3.13 install so we don't depend
# on Debian's system Python). LibreOffice was removed along with the
# legacy xlsx-template-upload reporting path -- see reports.ts/Reporting.tsx.
##########################################################################
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-dejavu-core \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV UV_INSTALL_DIR=/usr/local/bin
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
WORKDIR /app

# 2026-10-01: `uv sync` does NOT make `.venv` self-contained -- by default
# `uv python install` downloads the actual Python 3.13 interpreter into a
# separate managed-toolchain directory (normally under $HOME, i.e. inside
# whichever stage ran the install), and `.venv/bin/python3` is only a
# symlink pointing *into* that directory. The runtime stage below was
# copying `/app/.venv` from the `pydeps` stage but never copying this
# toolchain directory too, so the copied symlink pointed at a path that
# didn't exist in the runtime image -- `spawn` reported this as
# "spawn /app/.venv/bin/python3 ENOENT" (a dangling symlink and a missing
# file produce the identical errno). Pinning the install dir here, to a
# path both the `pydeps` and `runtime` stages agree on, means the symlink
# target actually exists once that directory is copied over below.
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python

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
# so the app's plain `spawn("python3", ...)` calls resolve to it. The venv
# itself is just symlinks into UV_PYTHON_INSTALL_DIR (set in the `base`
# stage above), so that directory has to come over too, or the symlinks
# dangle -- see the comment on UV_PYTHON_INSTALL_DIR above for how this
# broke before.
COPY --from=pydeps /opt/uv-python /opt/uv-python
COPY --from=pydeps /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:${PATH}"

# Fail the build here, loudly, instead of shipping an image where the venv
# silently can't run -- this actually executes the copied interpreter
# rather than just checking the file exists, so a dangling symlink (the
# exact failure mode above) or any other way the venv could end up broken
# is caught now, not the next time a report is generated in production.
RUN python3 -c "import matplotlib, pandas, numpy; print('venv OK:', __import__('sys').version)"

EXPOSE 3000
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
