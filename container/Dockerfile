# container/Dockerfile

# =====================================================================================
# 🛑 CRITICAL VERSION SYNCHRONIZATION REQUIREMENT 🛑
# Always match the Docker image version to your npm package version (`@cloudflare/sandbox`). 
#
# Why this matters: The SDK automatically checks version compatibility on startup. 
# Mismatched versions WILL cause features to break or behave unexpectedly (e.g., 
# 500 Internal Server Error when executing commands). If you upgrade the SDK in 
# package.json, you MUST upgrade ALL base image tags below to the exact same version.
# =====================================================================================

# Multi-variant sandbox image with JS/TS, Python, and OpenCode capabilities
# All three cloudflare/sandbox base images are layered into a single image.

FROM docker.io/cloudflare/sandbox:0.7.4-python AS python-stage
FROM docker.io/cloudflare/sandbox:0.7.4-opencode AS opencode-stage

FROM docker.io/cloudflare/sandbox:0.7.4

# --- Merge Python variant assets ---
# Python 3.11 + pip + venv + pre-installed data-science packages
COPY --from=python-stage /usr/bin/python3* /usr/bin/
COPY --from=python-stage /usr/lib/python3* /usr/lib/python3/
COPY --from=python-stage /usr/local/lib/python3* /usr/local/lib/python3/
COPY --from=python-stage /usr/local/bin/pip* /usr/local/bin/
COPY --from=python-stage /usr/local/bin/ipython* /usr/local/bin/

# --- Merge OpenCode variant assets ---
# OpenCode CLI for AI-powered coding agents
COPY --from=opencode-stage /usr/local/lib/node_modules/opencode-ai /usr/local/lib/node_modules/opencode-ai
RUN ln -s /usr/local/lib/node_modules/opencode-ai/bin/opencode /usr/local/bin/opencode

# --- Install additional system dependencies ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    make \
    g++ \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# --- Install global Node.js tools ---
RUN npm install -g typescript ts-node vitest

# --- Install code-server (browser IDE) ---
RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --method standalone --prefix /usr/local

# --- Install trufflehog (secret scanner) ---
RUN set -eux; \
    ARCH="$(dpkg --print-architecture)"; \
    case "$ARCH" in \
      amd64) TG_ARCH="amd64" ;; \
      arm64) TG_ARCH="arm64" ;; \
      *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac; \
    TG_URL="$(curl -fsSL https://api.github.com/repos/trufflesecurity/trufflehog/releases/latest \
      | grep -Eo "https://[^\"]*trufflehog_[^\" ]*_linux_${TG_ARCH}\\.tar\\.gz" \
      | head -n 1)"; \
    test -n "$TG_URL"; \
    curl -sSfL "$TG_URL" \
      | tar -xz -C /tmp; \
    mv /tmp/trufflehog /usr/local/bin/trufflehog; \
    chmod +x /usr/local/bin/trufflehog

# --- Expose ports for local development ---
# Port 8788: Control API (Supervisor)
# Port 8080: code-server (debug/IDE)
EXPOSE 8788
EXPOSE 8080

# --- Use sandbox entrypoint ---
# The Sandbox binary starts the HTTP API server that enables SDK communication.
ENTRYPOINT ["/container-server/sandbox"]
