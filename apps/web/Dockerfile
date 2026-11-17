FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install --workspaces --include-workspace-root || npm install
WORKDIR /app/apps/web
CMD ["npx", "next", "start"]
