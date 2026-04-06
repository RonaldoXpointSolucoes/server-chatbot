FROM node:20-alpine
RUN apk add --no-cache git

WORKDIR /app

# Copy the entire workspace into the image so local references like "file:../baileys-core" will work
COPY . .

# We need to install dependencies in baileys-core if any
WORKDIR /app/baileys-core
RUN npm install
RUN npm run build
RUN npm pack

# Then install dependencies in server
WORKDIR /app/server
RUN npm install
# Ensure we install the packed tarball exactly
RUN npm install /app/baileys-core/baileys-*.tgz

ENV PORT=9000
EXPOSE 9000

CMD ["npm", "start"]
