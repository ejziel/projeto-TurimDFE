FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

EXPOSE 3001

CMD ["npx", "ts-node-dev", "--respawn", "--transpile-only", "src/index.ts"]
