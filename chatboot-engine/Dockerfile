FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install OS dependencies needed by Baileys/Pino (if any, like ffmpeg later)
RUN apk add --no-cache ffmpeg curl

# Copy dependencies definitions
COPY package*.json ./

# Install packages
RUN npm install

# Copy application files
COPY . .

# Expose required port
EXPOSE 9000

# Start Engine
CMD ["node", "index.js"]
