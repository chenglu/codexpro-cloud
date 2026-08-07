ARG CLOUDFLARED_VERSION=2026.7.2
ARG NODE_IMAGE=node:22-bookworm-slim

FROM cloudflare/cloudflared:${CLOUDFLARED_VERSION} AS cloudflared

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.source="https://github.com/chenglu/codexpro-cloud" \
      org.opencontainers.image.description="Single-workspace CodexPro MCP server with an MCP-only Cloudflare Tunnel" \
      org.opencontainers.image.licenses="MIT"

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      jq \
      openssh-client \
      ripgrep \
      tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 codexpro \
    && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash codexpro

COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY cloud ./cloud
COPY LICENSE README.md README_ZH.md ./

RUN mkdir -p /data/config /data/secrets /data/codexpro /data/home /workspace \
    && chown -R codexpro:codexpro /data /workspace /home/codexpro \
    && chmod 700 /data /data/config /data/secrets /data/codexpro /data/home

ENV NODE_ENV=production \
    CODEXPRO_DATA_DIR=/data \
    CODEXPRO_WORKSPACE_DIR=/workspace \
    CODEXPRO_CONTROL_HOST=0.0.0.0 \
    CODEXPRO_CONTROL_PORT=8789 \
    HOME=/data/home

USER 10001:10001
VOLUME ["/data", "/workspace"]
EXPOSE 8789

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "cloud/healthcheck.mjs"]

ENTRYPOINT ["/usr/bin/tini", "--", "node", "cloud/supervisor.mjs"]
