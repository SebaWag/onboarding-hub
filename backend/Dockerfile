# Backend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck and ffmpeg for audio extraction
RUN apk add --no-cache curl ffmpeg

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy built files from builder
# NOTA: no copiar .env a la imagen - las variables las inyecta docker-compose
# via environment:/env_file: en runtime.
COPY --from=builder /app/dist ./dist

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4001/api/health || exit 1

CMD ["node", "dist/index.js"]
