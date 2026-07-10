# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/devcontainers/typescript-node:22-bookworm

# Install system dependencies for E2E testing
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        mosquitto \
        nginx \
        net-tools \
        iproute2 \
        iputils-ping \
        openssl \
        python3 \
        python3-pip \
        python3-venv \
        sudo \
        curl \
        git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack to manage package managers like pnpm    
RUN corepack enable

# Expose all required ports for E2E testing
EXPOSE 3001 3002 3003 3004 3005 3006 3007 9222

# Set up workspace
WORKDIR /workspace

# Copy package files and install dependencies as root, then switch to non-root user
COPY package*.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --dangerously-allow-all-builds

# Copy the rest of the workspace
COPY . .

# Set permissions for node user
RUN chown -R node:node /workspace

# Switch to non-root user
USER node

# Entrypoint: nothing, let devcontainer handle shell
