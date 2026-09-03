# Multi-stage build para Whatsmeow Engine (Go)
FROM golang:alpine AS builder


WORKDIR /app

# Dependências para CGO (SQLite)
RUN apk add --no-cache gcc musl-dev git

COPY go.mod go.sum* ./
RUN go mod download || true

COPY . .
RUN go mod tidy
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o whatsmeow-engine main.go

# Imagem final de produção ultraleve
FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

ENV PORT=8081
ENV DB_PATH=/data/sessions.db
ENV TZ=America/Sao_Paulo

VOLUME ["/data"]

COPY --from=builder /app/whatsmeow-engine /app/whatsmeow-engine

EXPOSE 8081

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8081/health || exit 1

ENTRYPOINT ["/app/whatsmeow-engine"]
