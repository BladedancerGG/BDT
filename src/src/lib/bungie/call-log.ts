// Journal des appels sortants vers bungie.net (table `BungieApi`).
//
// Serveur uniquement. Le journal ne doit JAMAIS faire échouer ni ralentir
// l'appel qu'il décrit : aucune écriture n'est attendue par l'appelant, et
// toutes les erreurs de base sont avalées (puis consignées).

import {prisma} from "@/lib/db/prisma";

/** Statuts d'un appel. Toute valeur ajoutée ici doit l'être aussi dans `admin.calls.status` (messages). */
export const BUNGIE_CALL_STATUSES = ["pending", "running", "success", "failure"] as const;
export type BungieCallStatus = (typeof BUNGIE_CALL_STATUSES)[number];

// —— Propriétaire d'un jeton ————————————————————————————————
//
// `bungieFetch` reçoit un access token, pas un utilisateur, et ses cinq
// appelants n'en savent pas plus. Plutôt que de faire descendre un identifiant
// à travers toutes les signatures, `getValidAccessToken` — par où passe tout
// jeton servi à un appel — note ici à qui il appartient.
//
// Posée sur globalThis : le rechargement à chaud recrée le module, et la table
// vide ferait perdre l'attribution jusqu'à la prochaine requête.

interface Owner {
    userId: string;
    /** Au-delà, le jeton a expiré : l'entrée ne servira plus */
    expiresAt: number;
}

const globalForOwners = globalThis as unknown as {
    bungieTokenOwners: Map<string, Owner> | undefined;
};
const owners = (globalForOwners.bungieTokenOwners ??= new Map());

/** Associe un jeton à son utilisateur, et oublie les jetons expirés. */
export function rememberTokenOwner(accessToken: string, userId: string, expiresAt: Date): void {
    const now = Date.now();
    for (const [token, owner] of owners) {
        if (owner.expiresAt <= now) owners.delete(token);
    }
    owners.set(accessToken, {userId, expiresAt: expiresAt.getTime()});
}

function ownerOf(accessToken: string | undefined): string | null {
    if (!accessToken) return null;
    return owners.get(accessToken)?.userId ?? null;
}

// —— Normalisation du point d'entrée ————————————————————————

/**
 * Chemin regroupable : sans paramètres, chaque segment numérique remplacé par
 * `{id}`. `/Destiny2/3/Profile/4611686018…/?components=…` devient
 * `/Destiny2/{id}/Profile/{id}/` — sans quoi chaque compte aurait ses
 * propres points d'entrée.
 */
export function normalizeEndpoint(path: string): string {
    const bare = path.split("?")[0];
    return bare.replace(/\/\d+(?=\/|$)/g, "/{id}");
}

// —— Suivi d'un appel ————————————————————————————————————————

export interface CallTracker {
    /** La requête part (première tentative ou nouvelle tentative) */
    attempt(): void;
    /** Dernière réponse HTTP reçue, quel que soit son statut */
    response(httpStatus: number): void;
    succeed(): void;
    fail(error: unknown): void;
}

const ERROR_MAX = 300;

function describe(error: unknown): string {
    // Le code symbolique d'abord : c'est lui qui se compare d'un appel à l'autre.
    if (error && typeof error === "object" && "errorStatus" in error) {
        const status = (error as {errorStatus?: unknown}).errorStatus;
        if (typeof status === "string" && status) return status;
    }
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, ERROR_MAX);
}

/**
 * Ouvre la ligne d'un appel, « en attente », et rend de quoi la faire avancer.
 *
 * Les écritures sont enchaînées sur une même promesse : la création doit avoir
 * abouti avant la première mise à jour, et l'ordre des statuts doit être celui
 * des événements — deux écritures concurrentes pourraient laisser « en cours »
 * sur un appel terminé.
 */
export function trackBungieCall({
    method,
    path,
    accessToken,
    userId,
}: {
    method: string;
    path: string;
    accessToken?: string;
    /** À défaut, déduit du jeton */
    userId?: string | null;
}): CallTracker {
    const started = Date.now();
    let attempts = 0;
    let httpStatus: number | null = null;
    let id: string | null = null;

    let chain: Promise<unknown> = prisma.bungieApi
        .create({
            data: {
                method,
                endpoint: normalizeEndpoint(path),
                status: "pending" satisfies BungieCallStatus,
                userId: userId ?? ownerOf(accessToken),
            },
            select: {id: true},
        })
        .then((row) => {
            id = row.id;
        })
        .catch(report);

    function update(data: Parameters<typeof prisma.bungieApi.update>[0]["data"]) {
        chain = chain
            .then(() => (id ? prisma.bungieApi.update({where: {id}, data}) : undefined))
            .catch(report);
    }

    return {
        attempt() {
            attempts += 1;
            update({status: "running" satisfies BungieCallStatus, attempts});
        },
        response(status) {
            httpStatus = status;
        },
        succeed() {
            update({
                status: "success" satisfies BungieCallStatus,
                httpStatus,
                attempts,
                durationMs: Date.now() - started,
                finishedAt: new Date(),
            });
        },
        fail(error) {
            update({
                status: "failure" satisfies BungieCallStatus,
                httpStatus,
                attempts,
                error: describe(error),
                durationMs: Date.now() - started,
                finishedAt: new Date(),
            });
        },
    };
}

function report(error: unknown): void {
    console.error("[bungie-call-log] écriture impossible :", error);
}
