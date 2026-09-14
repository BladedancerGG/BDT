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
# Pas de `COPY --from=deps` ici : `node_modules` vient du bind mount du projet
# (voir docker-compose.yml), qui masquerait de toute façon ce que l'image livre.
# C'est l'entrypoint qui l'installe au démarrage.
COPY . .

# Le conteneur tourne sous l'UID de l'hôte (docker-compose.yml) afin que les
# fichiers écrits dans le bind mount — node_modules, src/generated — lui
# appartiennent. Cet UID n'a pas forcément de home dans l'image : on sort donc
# de $HOME tout ce que les outils veulent écrire, sans quoi npm échoue sur un
# cache introuvable.
ENV npm_config_cache=/tmp/npm-cache
ENV NEXT_TELEMETRY_DISABLED=1

# `.next` reste dans un volume anonyme : le build de Next y écrit sans cesse et
# n'a rien à faire dans l'arborescence de l'hôte. Le volume hérite des droits du
# dossier de l'image — d'où le 777, l'UID qui montera n'étant pas connu ici.
RUN mkdir -p /app/.next && chmod 777 /app/.next

EXPOSE 3000
CMD ["sh", "scripts/docker/dev-entrypoint.sh"]

# ---- Étape build (production) ----
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `public/` peut être absent du contexte : Git ne versionne pas les dossiers
# vides. On le crée donc pour que la copie de l'étape production aboutisse
# toujours, même sans fichier statique.
#
# URL factice : `prisma generate` n'a besoin d'aucune base, mais depuis la v7 il
# charge prisma.config.ts, dont le env("DATABASE_URL") lève si la variable
# manque — et il n'y a pas de base au build. Elle ne peut pas fuir jusqu'aux
# migrations : l'étape migrate reçoit son DATABASE_URL de compose, en
# ${POSTGRES_*:?} qui échoue si la valeur manque. L'hôte pointe volontairement
# dans le vide pour qu'un usage accidentel se voie tout de suite.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:1/build?schema=public
RUN mkdir -p public && npx --no-install prisma generate && npm run build

# ---- Étape migrations ----
# Conserve node_modules complet : le CLI Prisma est absent de la sortie
# autonome. Ce conteneur ne tourne qu'au déploiement, puis s'arrête.
FROM builder AS migrate
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

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
