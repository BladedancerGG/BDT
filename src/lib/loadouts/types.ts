// Contrat entre le navigateur et /api/loadouts.
//
// Pas de directive "use client" : la route de l'API l'importe aussi, et une
// constante exportée depuis un module client arrive `undefined` côté serveur
// (voir lib/settings/constants.ts).

export const LOADOUT_ACTIONS = [
    "equip",
    "snapshot",
    "clear",
    "identifiers",
] as const;
export type LoadoutActionKind = (typeof LOADOUT_ACTIONS)[number];

export interface LoadoutActionRequest {
    kind: LoadoutActionKind;
    characterId: string;
    /** Place de l'emplacement dans la liste du personnage, à partir de 0 */
    loadoutIndex: number;
    /**
     * Identifiants de l'emplacement. Facultatifs sur un écrasement, où ils
     * servent à les **conserver** — omis, Bungie remet ceux par défaut et
     * l'emplacement perdrait sa couleur, son glyphe et son nom. Requis en
     * revanche pour `identifiers`, dont c'est tout l'objet.
     */
    colorHash?: number;
    iconHash?: number;
    nameHash?: number;
}

/** Motif de refus renvoyé par Bungie, transmis tel quel à l'interface. */
export interface LoadoutActionError {
    status?: string;
    message?: string;
}

function isHash(value: unknown): boolean {
    return value === undefined || (typeof value === "number" && value >= 0);
}

export function isLoadoutActionRequest(
    value: unknown,
): value is LoadoutActionRequest {
    if (typeof value !== "object" || value === null) return false;
    const body = value as Record<string, unknown>;
    return (
        LOADOUT_ACTIONS.includes(body.kind as LoadoutActionKind) &&
        typeof body.characterId === "string" &&
        body.characterId.length > 0 &&
        typeof body.loadoutIndex === "number" &&
        Number.isInteger(body.loadoutIndex) &&
        body.loadoutIndex >= 0 &&
        isHash(body.colorHash) &&
        isHash(body.iconHash) &&
        isHash(body.nameHash) &&
        // `identifiers` n'a de sens qu'avec les trois valeurs : l'endpoint les
        // écrit toutes les trois d'un bloc.
        (body.kind !== "identifiers" ||
            (typeof body.colorHash === "number" &&
                typeof body.iconHash === "number" &&
                typeof body.nameHash === "number"))
    );
}

/**
 * L'action sur un emplacement telle qu'elle vit dans la file d'actions.
 *
 * La requête est **enveloppée** plutôt qu'étendue : `LoadoutActionRequest` porte
 * déjà un `kind` — ce qu'on fait à l'emplacement — et la file a besoin du sien,
 * celui qui aiguille l'envoi vers `/api/loadouts` plutôt que vers les routes de
 * déplacement ou de socket.
 */
export interface LoadoutStepRequest {
    kind: "loadout";
    request: LoadoutActionRequest;
}

/**
 * Refus détecté avant tout envoi.
 *
 * `noIdentifiers` couvre l'enregistrement sur un emplacement libre alors que les
 * constantes du manifeste ne sont pas lues : `SnapshotLoadout` exige les trois
 * identifiants, l'appel partirait pour être refusé.
 */
export type LoadoutFailure = "noCharacter" | "noIdentifiers";
