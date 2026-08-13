# Stage 1: Build WaCalls Go binary (Fallback compile if pre-built binary is missing)
FROM golang:alpine AS go-builder
RUN apk add --no-cache git
WORKDIR /build

COPY wacalls-go/go.mod wacalls-go/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY wacalls-go/ ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    if [ -f bin/wacalls-server ]; then \
        echo "Using pre-compiled Go binary from bin/wacalls-server"; \
        cp bin/wacalls-server /build/wacalls-server; \
    else \
        echo "Compiling Go binary from source..."; \
        CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o wacalls-server ./cmd/server; \
    fi

# Stage 2: Main Node.js app (node:20 comes with git, libgomp1, procps pre-installed)
FROM node:20
WORKDIR /app

# 1. Install dependencies and build baileys-core
COPY baileys-core/ /app/baileys-core/
WORKDIR /app/baileys-core
RUN --mount=type=cache,target=/root/.npm npm install --legacy-peer-deps
RUN npm run build

# 2. Install dependencies and setup server
COPY server/ /app/server/
WORKDIR /app/server
RUN --mount=type=cache,target=/root/.npm npm install --legacy-peer-deps

# 3. Copy compiled Go binary from Stage 1 into the server directory
COPY --from=go-builder /build/wacalls-server /app/server/wacalls-server

# Create data directory for persistent SQLite database
RUN mkdir -p /app/server/data

ENV PORT=9000
EXPOSE 9000

CMD ["npm", "start"]
