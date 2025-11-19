# Build
FROM node:22-slim AS build
WORKDIR /app
COPY collector/package.json collector/package-lock.json* ./
# Ensure we can build better-sqlite3 if a prebuild isn't available
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm ci
COPY collector/tsconfig.json tsconfig.json
COPY collector/src src
RUN npm run build

# Runtime
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
# Copy package.json for npm scripts
COPY --from=build /app/package.json /app/package.json
# Copy production deps only
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
# A non-root user is fine; DB file will be created on a shared volume with liberal perms (umask in code).
USER node
CMD ["node", "dist/index.js"]
