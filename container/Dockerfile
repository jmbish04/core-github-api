# container/Dockerfile
FROM node:20-slim

# 1. Install System Dependencies
# python3/make/g++ are needed to build node-pty
# git/curl are needed for the agent's operations
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 2. Setup Workspace
WORKDIR /app

# 3. Install App Dependencies
COPY package.json tsconfig.json ./
RUN npm install

# 4. Install Global Tools (Your Agent's Toolkit)
# Replace these with your actual CLI tools if hosted on npm
RUN npm install -g typescript ts-node
# RUN npm install -g @colby/cli gemini-chat-cli

# 5. Copy Source
COPY src ./src

# 6. Build
RUN npm run build

# 7. Expose Port (Standard for Cloudflare Containers)
EXPOSE 8080

# 8. Start
CMD ["node", "dist/server.js"]
