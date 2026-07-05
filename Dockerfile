# Stage 1: Build WaCalls Go binary
FROM golang:alpine AS go-builder
RUN apk add --no-cache git
WORKDIR /build
# Copy wacalls-go source
COPY wacalls-go/ ./
# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o wacalls-server ./cmd/server

# Stage 2: Main Node.js app
FROM node:20-slim
RUN apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=3 -o Acquire::http::Timeout="15" update && \
    apt-get install -y git libgomp1 procps && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire workspace into the image so local references like "file:../baileys-core" will work
COPY . .

# Copy compiled Go binary from Stage 1 into the server directory
COPY --from=go-builder /build/wacalls-server /app/server/wacalls-server

# We need to install dependencies in baileys-core if any
WORKDIR /app/baileys-core
RUN npm install
RUN npm run build
RUN npm pack

# Then install dependencies in server
WORKDIR /app/server
RUN npm install --legacy-peer-deps
# Ensure we install the packed tarball exactly
RUN npm install /app/baileys-core/baileys-7.0.0-rc.9.tgz --legacy-peer-deps

# Create data directory for persistent SQLite database
RUN mkdir -p /app/server/data

ENV PORT=9000
EXPOSE 9000

CMD ["npm", "start"]
