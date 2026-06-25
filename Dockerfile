# Build Stage
FROM node:18-alpine as builder

# Add non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only necessary files first
COPY package*.json ./
COPY tsconfig*.json ./
COPY .env.example ./.env

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . .
RUN npm run build

# Production Stage
FROM node:18-alpine

# Add non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package*.json ./
COPY --from=builder --chown=appuser:appgroup /app/.env ./

# Switch to non-root user
USER appuser

EXPOSE 4300

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s \
  CMD wget --no-verbose --tries=1 --spider https://cc7d-42-116-239-137.ngrok-free.app/api/health || exit 1

CMD ["npm", "start"]
