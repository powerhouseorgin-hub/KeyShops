# ---- Build stage ----
# Node 22+ required: @supabase/supabase-js's realtime-js dependency needs
# native WebSocket support (added in Node 22), even though we only use
# Supabase Storage, not realtime subscriptions.
FROM node:22-slim AS build
WORKDIR /app

# Prisma's engine downloads need openssl on Debian-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run prisma:generate
RUN npm run build

# ---- Runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=build /app/dist ./dist

# Cloud Run injects PORT at runtime; NestJS main.ts already reads process.env.PORT
EXPOSE 4000

# Run pending migrations then start the API. `prisma migrate deploy` is safe to
# run on every boot — it only applies migrations that haven't run yet.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
