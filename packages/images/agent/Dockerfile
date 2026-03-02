FROM node:22-slim

RUN apt-get update && apt-get install -y curl bash python3 && rm -rf /var/lib/apt/lists/*

# Install claude CLI
RUN npm install -g @anthropic-ai/claude-code

# Install the call_agent tool
COPY call_agent /usr/local/bin/call_agent
RUN chmod +x /usr/local/bin/call_agent

WORKDIR /workspace
