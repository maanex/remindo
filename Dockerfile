# Use the official lightweight Bun Alpine image
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install production dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Final lightweight production runtime
FROM base AS runner
ENV NODE_ENV=production

# Set ownership of app directory so SQLite can create/write files as non-root
RUN chown bun:bun /app

# Run as built-in non-root bun user
USER bun

# Copy dependencies and application source
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun . .

CMD ["bun", "run", "src/index.ts"]

