# Makefile — raccourcis pour les commandes Docker / projet.
# Lancer "make" ou "make help" pour voir toutes les cibles disponibles.

# ".PHONY" : ces cibles ne sont pas des fichiers, make les exécute toujours.
.PHONY: prod-up prod-down prod-restart prod-build prod-logs prod-ps prod-migrate \
        prod-backup prod-restore prod-restart-next prod-build-next prod-cold-start prod-update \
        prod-update-next pull \
        help start stop restart build up down app-shell db-shell backup restore \
        migrate generate studio lint clean reset

# Cible par défaut (exécutée quand on tape juste "make")
.DEFAULT_GOAL := start

## —— Docker ————————————————————————————————————————————————

start: up ## Alias of "up"
up: ## Starts the application and builds the containers if needed
	docker compose up

stop: down ## Alias of "down"
down: ## Stops the application (application and DB data are saved)
	docker compose down

restart: ## Restarts the application
	docker compose restart

build: ## Builds the containers without starting the application
	docker compose build

## —— Accès aux conteneurs ——————————————————————————————————

app-shell: ## Enter the application container through a bash shell
	docker compose exec app sh

db-shell: ## Enter the database container through a psql shell
	docker compose exec db psql -U $${POSTGRES_USER:-bdt} -d $${POSTGRES_DB:-bdt}

get-user-count: ## Lists the current amount of registered users
	docker compose exec db psql -U $${POSTGRES_USER:-bdt} -d $${POSTGRES_DB:-bdt} -c 'select count("id") from "User";'

get-user-list: ## Lists the current amount and names of registered users
	docker compose exec db psql -U $${POSTGRES_USER:-bdt} -d $${POSTGRES_DB:-bdt} -c 'select "displayName", "createdAt" from "User" order by "createdAt";'

## —— Base de données (Prisma) ——————————————————————————————

migrate: ## Run database migrations
	docker compose exec app npm run db:migrate

generate: ## Regenerate the Prisma client
	docker compose exec app npm run db:generate

studio: ## Opens Prisma Studio (http://localhost:5555)
	docker compose exec app npm run db:studio

## —— Projet ————————————————————————————————————————————————

lint: ## Starts the code linter
	docker compose exec app npm run lint

## —— Sauvegarde / restauration ————————————————————————————
# Les identifiants Postgres ne vivent que dans .env, que make ne charge pas :
# les variables sont donc déréférencées DANS le conteneur, qui les a déjà.
# $(1) : la commande docker compose visée (locale ou production).

define dump_db
	$(1) exec -T db sh -c 'pg_dump -U "$$POSTGRES_USER" "$$POSTGRES_DB"' \
		| gzip > backup-$$(date +%Y%m%d-%H%M%S).sql.gz
	@echo "Sauvegarde écrite."
endef

# Accepte un .sql ou un .sql.gz. Le schéma est vidé d'abord : un dump pg_dump
# ne contient aucun DROP, sans quoi l'import échouerait sur les tables déjà là.
define restore_db
	@test -n "$(file)" || { echo "Usage : make $@ file=backup-<date>.sql.gz"; exit 1; }
	@test -f "$(file)" || { echo "Fichier introuvable : $(file)"; exit 1; }
	@printf "Le contenu de la base va être ÉCRASÉ par %s. Confirmer ? [y/N] " "$(file)"
	@read reponse; [ "$$reponse" = "y" ] || { echo "Annulé."; exit 1; }
	@$(1) exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" \
		-c "SET client_min_messages = warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
	@case "$(file)" in *.gz) gunzip -c "$(file)";; *) cat "$(file)";; esac \
		| $(1) exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -o /dev/null -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'
	@echo "Dump importé."
endef

backup: ## Dumps local database content inside a new backup-<date>.sql.gz file
	$(call dump_db,docker compose)

restore: ## Restores a database from a file (ex: make restore file=backup.sql.gz)
	$(call restore_db,docker compose)

## —— Production ————————————————————————————————————————————
# Ces cibles s'utilisent SUR LE SERVEUR, avec un .env de production
# (voir .env.production.example).

COMPOSE_PROD = docker compose -f docker-compose.prod.yml

prod-up: ## Starts the application in production mode
	$(COMPOSE_PROD) up -d

prod-down: ## Stops the production application
	$(COMPOSE_PROD) down

prod-restart: ## Restarts the production application
	$(COMPOSE_PROD) restart

prod-build: ## Builds the containers for the production application
	$(COMPOSE_PROD) build

prod-migrate: ## Runs production database migrations
	$(COMPOSE_PROD) run --rm migrate

prod-backup: ## Dumps production database content inside a new backup-<date>.sql.gz file
	$(call dump_db,$(COMPOSE_PROD))

prod-restore: ## Restores a production database from a file (ex: make restore file=backup.sql.gz)
	$(call restore_db,$(COMPOSE_PROD))


## -- Commandes de prod spécifiques

prod-restart-next: ## Restarts the next.js container only
	$(COMPOSE_PROD) restart app

prod-build-next: ## Builds the next.js container
	$(COMPOSE_PROD) build app

prod-cold-start: pull prod-build prod-up ## Pull latest version of, builds and starts all of the containers

prod-update: pull prod-build prod-down prod-up ## Pull latest version of, builds and restarts all of the containers

prod-update-next: pull prod-build-next ## Pull latest version of, builds and restarts the next.js container (les migrations ne sont pas rejouées : voir prod-migrate)
	$(COMPOSE_PROD) up -d --no-deps --force-recreate app

## —— Nettoyage —————————————————————————————————————————————

clean: ## Stops the applications and deletes ALL local application data (DB, etc.)
	docker compose down -v

reset: clean build up ## Resets the app to a clean state and restarts it

## -- Git ---------------------------------------------------

pull: ## Pulls the latest changes from the remote GitHub repository
	git pull

## —— Aide ——————————————————————————————————————————————————

help: ## Prints this help message
	@echo "Commandes disponibles :"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
