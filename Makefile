# Makefile — raccourcis pour les commandes Docker / projet.
# Lancer "make" ou "make help" pour voir toutes les cibles disponibles.

# ".PHONY" : ces cibles ne sont pas des fichiers, make les exécute toujours.
.PHONY: help start stop restart build up down logs logs-db shell db-shell \
        ps migrate generate studio install lint clean reset

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
	docker compose exec db psql -U $${POSTGRES_USER:-dlm} -d $${POSTGRES_DB:-dlm}

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

## —— Nettoyage —————————————————————————————————————————————

clean: ## Arrête tout et SUPPRIME les données de la base (volume)
	docker compose down -v

reset: clean build up ## Remise à zéro complète : clean + rebuild + démarrage

## —— Aide ——————————————————————————————————————————————————

help: ## Affiche cette aide
	@echo "Commandes disponibles :"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
