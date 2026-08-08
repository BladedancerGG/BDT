import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@/generated/prisma/client";

// Prisma 7 n'embarque plus de moteur Rust : tout accès passe par un adaptateur
// de pilote, ici node-postgres. L'URL vient de l'environnement et non plus du
// schéma, qui ne la porte plus.
//
// Singleton — évite d'ouvrir trop de connexions en dev (hot-reload). Le pool de
// l'adaptateur est mis en cache avec le client : en recréer un à chaque
// rechargement laisserait des connexions ouvertes derrière lui.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({connectionString: process.env.DATABASE_URL});
  return new PrismaClient({adapter});
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
