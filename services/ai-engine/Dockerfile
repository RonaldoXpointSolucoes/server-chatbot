FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

ENV PORT=8082
ENV NODE_ENV=production

EXPOSE 8082

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8082/health || exit 1

CMD ["node", "src/index.js"]
