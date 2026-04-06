FROM node:20-alpine

WORKDIR /app

# Copy the entire workspace into the image so local references like "file:../baileys-core" will work
COPY . .

# We need to install dependencies in baileys-core if any
WORKDIR /app/baileys-core
RUN npm install

# Then install dependencies in server
WORKDIR /app/server
RUN npm install

ENV PORT=9000
EXPOSE 9000

CMD ["npm", "start"]
