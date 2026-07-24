# syntax=docker/dockerfile:1

# ---- Étape de base ----
# Image Node officielle, version alpine (légère)
FROM node:22-alpine AS base
WORKDIR /app
# openssl est requis par Prisma
RUN apk add --no-cache openssl

# ---- Étape dépendances ----
# Isolée pour profiter du cache Docker : ne se relance que si package*.json change
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

# ---- Étape développement ----
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
# Génère le client Prisma au démarrage (le schéma est monté en volume, donc
# absent au moment du "npm install" de l'étape deps) puis lance le serveur.
CMD ["sh", "-c", "npx prisma generate && npm run dev"]

# ---- Étape build (production) ----
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- Étape production ----
FROM base AS prod
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
