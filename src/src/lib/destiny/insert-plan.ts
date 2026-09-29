// Ce qu'une insertion d'attribut demande réellement, au moment de l'envoi.
//
// Un module **pur**, comme `moves.ts` : il reçoit la définition de l'objet, son
// état tel qu'il est *maintenant*, et la requête voulue. Il rend les requêtes à
// envoyer — parfois aucune, parfois plusieurs.
//
// Pas de directive "use client" : rien de réactif ici.

import type {InsertStepRequest} from "@/lib/actions/sockets";
import type {InventoryItemDefinition} from "./types";
import {
    armorModSocketIndexes,
    artifactDuplicateSocket,
    socketInitialPlug,
} from "./sockets";

/** Ce que le plan ne peut pas deviner : l'état de l'objet et le manifeste. */
export interface InsertContext {
    def: InventoryItemDefinition | undefined;
    /** Attributs en place, indexés par index de socket */
    sockets: readonly number[];
    /**
     * Énergie **totale** de l'armure, absente sur tout le reste.
     *
     * La capacité et non l'énergie libre, bien que l'API donne les deux : la
     * capacité ne bouge pas d'une insertion à l'autre, alors qu'`energyUsed`
     * n'est corrigé qu'au rechargement du profil. Reconstituer la consommation
     * depuis les sockets — que le cache local, lui, tient à jour — est le seul
     * moyen d'enchaîner plusieurs insertions sans se tromper dès la seconde.
     */
    energyCapacity?: number;
    /** Coût en énergie d'un attribut. Zéro s'il n'en a pas — voir `plug-energy.ts` */
    costOf: (plugHash: number) => number;
}

/**
 * Les requêtes d'une insertion, replanifiées contre l'état courant.
 *
 * Trois corrections, et aucune ne peut se faire ailleurs qu'ici — au moment de
 * l'envoi, pas à la mise en file : entre les deux, les actions précédentes ont
 * pu changer les sockets de cet objet.
 *
 *  - **L'attribut est déjà en place** : aucune requête. L'API refuse d'équiper
 *    ce qui l'est déjà, et le cas se présente pour de bon — deux emplacements
 *    d'un groupe portant la même arme demandent la même insertion, la seconde
 *    arrivant après que la première l'a satisfaite.
 *  - **Un autre socket du même artéfact porte cet attribut** : il faut d'abord
 *    l'en retirer, un artéfact n'équipant pas deux fois le même.
 *  - **L'énergie d'armure ne suffit pas** : les autres mods sont retirés
 *    d'abord. Voir `planArmorEnergy`.
 *
 * Rien de tout cela ne vaut pour `EquipLoadout` : Bungie y assemble
 * l'équipement lui-même et gère ces contraintes de son côté.
 */
export function planInsert(
    ctx: InsertContext,
    request: InsertStepRequest,
): InsertStepRequest[] {
    const {socketIndex, plugItemHash} = request;
    const {def, sockets} = ctx;

    if (sockets[socketIndex] === plugItemHash) return [];

    const duplicate = artifactDuplicateSocket(
        def,
        sockets,
        socketIndex,
        plugItemHash,
    );
    if (duplicate !== undefined) {
        const empty = socketInitialPlug(def, duplicate);
        // Sans plug d'origine connu, il n'y a rien à insérer pour libérer le
        // socket : mieux vaut tenter l'insertion voulue et laisser Bungie
        // répondre que de ne rien envoyer du tout.
        if (empty !== undefined) {
            return [{...request, socketIndex: duplicate, plugItemHash: empty}, request];
        }
    }

    return [...planArmorEnergy(ctx, request), request];
}

/**
 * Les retraits à faire pour que l'énergie d'armure suffise.
 *
 * L'énergie consommée est **reconstituée depuis les sockets** plutôt que lue
 * dans `energyUsed` : voir `InsertContext.energyCapacity`. Le socket visé n'en
 * fait pas partie du calcul de ce qui est disponible — son occupant actuel
 * libère sa part en étant remplacé.
 *
 * Quand ça ne rentre pas, **tous les autres mods** partent, et non le strict
 * nécessaire : il faudrait sinon désigner lesquels sacrifier, ce qu'aucun
 * critère ne justifie. Ne sont retirés que les sockets dont l'occupant coûte
 * réellement quelque chose — ce qui écarte de soi-même les emplacements vides,
 * la pièce maîtresse et l'artifice, tous sans coût (voir `plug-energy.ts`).
 */
function planArmorEnergy(
    {def, sockets, energyCapacity, costOf}: InsertContext,
    request: InsertStepRequest,
): InsertStepRequest[] {
    // Pas une armure, ou capacité inconnue : rien à vérifier. Armes, doctrines
    // et artéfacts ne consomment aucune énergie.
    if (energyCapacity === undefined) return [];

    const indexes = armorModSocketIndexes(def);
    if (!indexes.includes(request.socketIndex)) return [];

    const used = indexes.reduce(
        (total, index) => total + costOf(sockets[index] ?? 0),
        0,
    );
    const freedByReplacing = costOf(sockets[request.socketIndex] ?? 0);
    const available = energyCapacity - used + freedByReplacing;

    if (costOf(request.plugItemHash) <= available) return [];

    return indexes.flatMap((index) => {
        if (index === request.socketIndex) return [];
        if (costOf(sockets[index] ?? 0) === 0) return [];
        const empty = socketInitialPlug(def, index);
        return empty === undefined
            ? []
            : [{...request, socketIndex: index, plugItemHash: empty}];
    });
}
