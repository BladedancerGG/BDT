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

# ---- Étape migrations ----
# Conserve node_modules complet : le CLI Prisma est absent de la sortie
# autonome. Ce conteneur ne tourne qu'au déploiement, puis s'arrête.
FROM builder AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- Étape production ----
# Sortie autonome de Next : le serveur et ses seules dépendances utiles.
FROM base AS prod
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Le serveur tourne sans privilèges (l'utilisateur "node" existe dans l'image)
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000
# Point d'entrée généré par la sortie autonome
CMD ["node", "server.js"]
