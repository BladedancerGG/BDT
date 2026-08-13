# Makefile — raccourcis pour les commandes Docker / projet.
# Lancer "make" ou "make help" pour voir toutes les cibles disponibles.

# ".PHONY" : ces cibles ne sont pas des fichiers, make les exécute toujours.
.PHONY: prod-up prod-down prod-logs prod-ps prod-migrate prod-backup \
        help start stop restart build up down logs logs-db shell db-shell \
        ps migrate generate studio adminer install lint clean reset

# Cible par défaut (exécutée quand on tape juste "make")
.DEFAULT_GOAL := start

## —— Docker ————————————————————————————————————————————————

start: up ## Alias de "up" : démarre l'app + la base
up: ## Démarre les conteneurs en arrière-plan (build si nécessaire)
	docker compose up

stop: down ## Alias de "down" : arrête et supprime les conteneurs
down: ## Arrête et supprime les conteneurs (conserve les données)
	docker compose down

restart: ## Redémarre les conteneurs
	docker compose restart

build: ## (Re)construit les images sans démarrer
	docker compose build

ps: ## Liste l'état des conteneurs
	docker compose ps

logs: ## Suit les logs du serveur Next.js
	docker compose logs -f app

logs-db: ## Suit les logs de PostgreSQL
	docker compose logs -f db

## —— Accès aux conteneurs ——————————————————————————————————

shell: ## Ouvre un shell dans le conteneur de l'app
	docker compose exec app sh

db-shell: ## Ouvre une console psql dans la base
	docker compose exec db psql -U $${POSTGRES_USER:-bdt} -d $${POSTGRES_DB:-bdt}

## —— Base de données (Prisma) ——————————————————————————————

migrate: ## Crée et applique les migrations (dev)
	docker compose exec app npm run db:migrate

generate: ## Régénère le client Prisma
	docker compose exec app npm run db:generate

studio: ## Ouvre Prisma Studio (http://localhost:5555)
	docker compose exec app npm run db:studio

## —— Projet ————————————————————————————————————————————————

install: ## Installe une dépendance npm (ex: make install pkg=zod)
	docker compose exec app npm install $(pkg)

lint: ## Lance le linter
	docker compose exec app npm run lint

## —— Production ————————————————————————————————————————————
# Ces cibles s'utilisent SUR LE SERVEUR, avec un .env de production
# (voir .env.production.example).

COMPOSE_PROD = docker compose -f docker-compose.prod.yml

prod-up: ## Démarre le conteneur de production
	$(COMPOSE_PROD) up -d

prod-down: ## Arrête la production (conserve données et certificats)
	$(COMPOSE_PROD) down

prod-restart: ## Redémarre les conteneurs de production
	$(COMPOSE_PROD) restart

prod-build: ## Build les conteneurs de production
	$(COMPOSE_PROD) build

prod-logs: ## Suit les logs de l'application en production
	$(COMPOSE_PROD) logs -f app

prod-ps: ## État des conteneurs de production
	$(COMPOSE_PROD) ps

prod-migrate: ## Rejoue les migrations seules
	$(COMPOSE_PROD) run --rm migrate

prod-backup: ## Sauvegarde la base dans backup-<date>.sql.gz
	$(COMPOSE_PROD) exec -T db pg_dump -U $${POSTGRES_USER} $${POSTGRES_DB} \
		| gzip > backup-$$(date +%Y%m%d-%H%M%S).sql.gz
	@echo "Sauvegarde écrite."


## -- Commandes de prod spécifiques

prod-restart-next: ## Redémarre le conteneur next.js
	$(COMPOSE_PROD) restart app


prod-cold-start: pull prod-build prod-up ## Build et démarre la production (idéal lors du premier lancement du projet)

prod-update-all: pull prod-build prod-down prod-up ## Récupère la dernière version du code, build et redémarre TOUT les conteneurs (idéal pour envoyer des mises à jour sur plusieurs conteneurs en même temps)

prod-update-next: pull prod-build prod-restart-next ## Récupère la dernière version du code, build et redémarre uniquement le conteneur Next.js (idéal pour envoyer des mises à jours spécifiques à Next.js)

## —— Nettoyage —————————————————————————————————————————————

clean: ## Arrête tout et SUPPRIME les données de la base (volume)
	docker compose down -v

reset: clean build up ## Remise à zéro complète : clean + rebuild + démarrage

## -- Git ---------------------------------------------------

pull: ## Récupère et met à jour le projet depuis le repo Git
	git pull

## —— Aide ——————————————————————————————————————————————————

help: ## Affiche cette aide
	@echo "Commandes disponibles :"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
