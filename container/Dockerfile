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

# Stage 1: Extract OpenCode CLI
FROM docker.io/cloudflare/sandbox:0.9.1-opencode AS opencode-stage

# Stage 2: Use the Python variant as the main base image
# This completely avoids Python path/module corruption by keeping the native OS environment intact.
FROM docker.io/cloudflare/sandbox:0.9.1-python

# --- Install System Dependencies ---
RUN apt-get update && apt-get install -y --no-install-recommends \
  make \
  g++ \
  gnupg \
  curl \
  && rm -rf /var/lib/apt/lists/*

# --- Merge OpenCode variant assets ---
COPY --from=opencode-stage /usr/local/lib/node_modules/opencode-ai /usr/local/lib/node_modules/opencode-ai
RUN ln -s /usr/local/lib/node_modules/opencode-ai/bin/opencode /usr/local/bin/opencode

# --- Install Tooling & Dependencies ---
RUN npm install -g typescript ts-node vitest
# Because we are using the python base image natively, pip3 will now work flawlessly
RUN pip3 install --no-cache-dir requests psutil
RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --method standalone --prefix /usr/local


# --- Install trufflehog (secret scanner) ---
RUN ARCH="$(dpkg --print-architecture)" && \
  if [ "$ARCH" = "amd64" ]; then TG_ARCH="amd64"; \
  elif [ "$ARCH" = "arm64" ]; then TG_ARCH="arm64"; \
  else echo "Unsupported architecture: $ARCH" && exit 1; fi && \
  TG_URL="$(curl -fsSL https://api.github.com/repos/trufflesecurity/trufflehog/releases/latest | grep -Eo "https://[^\"]*trufflehog_[^\" ]*_linux_${TG_ARCH}\.tar\.gz" | head -n 1)" && \
  curl -sSfL "$TG_URL" | tar -xz -C /tmp && \
  mv /tmp/trufflehog /usr/local/bin/trufflehog && \
  chmod +x /usr/local/bin/trufflehog

# --- Setup Application Code ---
WORKDIR /app

# 1. Copy package files FIRST to leverage Docker layer caching
COPY package.json bun.lock* package-lock.json* ./

# 2. Install dependencies
RUN bun install --frozen-lockfile

# 3. Copy the rest of the application code
COPY . .

# 4. Ensure scripts are globally accessible and executable
RUN cp -r scripts /scripts 2>/dev/null || true && \
  chmod -R +x /scripts 2>/dev/null || true

# 5. Build the project
RUN bun run build

# --- Expose ports for local development ---
# 8788: Control API, 8080: code-server, 3001: agent-sdk HTTP server
EXPOSE 8788 8080 3001

# --- Use sandbox entrypoint ---
ENTRYPOINT ["/container-server/sandbox"]

# -- Run the application
CMD ["bun", "start"]