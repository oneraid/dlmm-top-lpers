FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install --workspaces --include-workspace-root || npm install
WORKDIR /app/workers
CMD ["npx", "tsx", "src/index.ts"]
