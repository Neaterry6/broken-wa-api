# Use Node LTS
FROM node:20-slim

WORKDIR /app

# Install build tools for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Create auth directory for session storage
RUN mkdir -p auth

EXPOSE 3000

CMD ["node", "index.js"]
