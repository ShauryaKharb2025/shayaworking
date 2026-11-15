FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/src/integrations/maritime/contract.js backend/src/integrations/maritime/contract.js
COPY agents/sahay-rescue/server.cjs agents/sahay-rescue/instructions.md agents/sahay-rescue/
USER node
CMD ["node", "agents/sahay-rescue/server.cjs"]
