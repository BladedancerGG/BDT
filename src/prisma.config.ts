// Configuration du CLI Prisma, obligatoire depuis la v7 : le schéma ne porte
// plus l'URL de connexion, c'est ici que Migrate va la chercher.
//
// L'import « dotenv/config » n'est pas décoratif : la v7 ne charge plus le .env
// toute seule. Sans lui, env("DATABASE_URL") échoue hors conteneur, là où la
// variable n'est pas déjà dans l'environnement.

import "dotenv/config";
import {defineConfig, env} from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        url: env("DATABASE_URL"),
    },
});
