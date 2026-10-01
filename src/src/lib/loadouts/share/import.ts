// Ce qu'importer un partage demande : retrouver ses objets dans un autre compte.
//
// Un module **pur**, comme `snapshot.ts` dont il est l'inverse : il reçoit
// l'instantané, les objets du compte qui importe et de quoi lire le manifeste,
// et rend les emplacements d'un groupe. Rien n'y est réactif, rien n'y part sur
// le réseau — d'où l'absence de "use client". Ses imports de valeur sont
// relatifs, pour que scripts/checks/ puisse l'exécuter.
//
// Tout l'enjeu tient en une phrase, la même que pour le partage : **un groupe
// désigne ses objets par instance**, et les instances de l'auteur n'existent
// pas chez celui qui importe. Chaque objet partagé doit donc être rapporté à un
// objet du compte — le même s'il y est (l'auteur qui importe son propre
// partage), sinon un exemplaire que l'utilisateur choisit.

import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {ARMOR_BUCKETS} from "../../destiny/buckets";
import {TIER} from "../../destiny/display";
import {upgradedPlug} from "../../destiny/perk-upgrades";
import {PLUG_SOURCE, isFixedPlug, isMasterworkPlug} from "../../destiny/sockets";
import {INVALID_HASH} from "../loadout";
import {emptyGroupLoadout, type GroupLoadout} from "../groups/types";
import type {SharedItem, SharedSnapshot} from "./types";

/** Classe sans restriction (DestinyClass.Unknown) : armes, coques… */
const CLASS_ANY = 3;

/** Un objet instancié du compte qui importe, et où il se trouve. */
export interface AccountItem {
    itemHash: number;
    itemInstanceId: string;
    /** Le personnage qui le détient, équipé ou rangé — `null` au coffre */
    characterId: string | null;
}

/** Ce que l'import ne peut pas deviner : le compte, et le manifeste. */
export interface ImportContext {
    items: readonly AccountItem[];
    /** Le détail de chaque objet du compte, tel que /api/profile le renvoie */
    details: Record<string, ItemDetail>;
    /**
     * Définitions des objets — ceux du partage comme ceux du compte — **et des
     * attributs** enregistrés : c'est leur famille qui dit lesquels se
     * reportent d'un exemplaire à l'autre. Voir `importDefinitionHashes`.
     */
    defOf: (hash: number) => InventoryItemDefinition | undefined;
}

/**
 * Un objet du partage, et les objets du compte qui peuvent le remplacer.
 *
 * Un par **instance** partagée, et non par emplacement : une arme qui sert
 * plusieurs emplacements du groupe doit y être remplacée partout par le même
 * exemplaire — c'est le même objet chez l'auteur.
 */
export interface ImportChoice {
    /** L'objet tel que le partage le décrit */
    shared: SharedItem;
    /**
     * L'instance de l'auteur est dans ce compte : elle est reprise telle
     * quelle, sans choix à proposer.
     */
    kept: boolean;
    /** Instances candidates, la plus probable en tête. Vide : rien ne convient */
    candidates: string[];
}

/** Par instance partagée, l'instance retenue — `null` : laissé vide. */
export type ImportPicks = ReadonlyMap<string, string | null>;

const isExotic = (def: InventoryItemDefinition | undefined) =>
    def?.inventory?.tierType === TIER.Exotic;

const setOf = (def: InventoryItemDefinition | undefined) =>
    def?.equippingBlock?.equipableItemSetHash;

/**
 * La classe pour laquelle le partage a été composé, si ses objets la disent.
 *
 * L'instantané ne la porte pas : elle se lit sur la doctrine ou les armures, les
 * seuls objets réservés à une classe. Un partage qui n'aurait que des armes n'en
 * a aucune — n'importe quel personnage peut alors le recevoir.
 */
export function shareClassType(
    snapshot: SharedSnapshot,
    defOf: ImportContext["defOf"],
): number | undefined {
    for (const loadout of snapshot.loadouts) {
        for (const item of loadout.items) {
            const classType = defOf(item.itemHash)?.classType;
            if (classType !== undefined && classType !== CLASS_ANY) return classType;
        }
    }
    return undefined;
}

/**
 * Les objets du partage, une fois chacun, avec ce qui peut les remplacer.
 *
 * Trois règles, dans cet ordre :
 *
 *  - **l'instance de l'auteur est dans le compte** : elle est reprise, sans
 *    choix — c'est l'auteur qui importe son propre partage ;
 *  - **une armure légendaire** se remplace par toute armure du même
 *    emplacement appartenant à l'un des ensembles que portent les emplacements
 *    où elle figure. Deux pièces d'un même ensemble ne se valent pas — leurs
 *    statistiques sont tirées au sort — mais c'est le bonus d'ensemble que
 *    l'auteur composait, et l'utilisateur choisit la pièce ;
 *  - **tout le reste** — armes, exotiques, doctrine — ne se remplace que par un
 *    objet du même hash.
 *
 * Un objet qui ne quitte pas son personnage (la doctrine) n'est cherché que sur
 * le personnage visé : un autre ne pourrait pas le lui prêter.
 */
export function importChoices(
    snapshot: SharedSnapshot,
    characterId: string,
    classType: number | undefined,
    ctx: ImportContext,
): ImportChoice[] {
    const byId = new Map(ctx.items.map((item) => [item.itemInstanceId, item]));

    /** Les objets du partage, chacun avec les ensembles de ses emplacements. */
    const shared = new Map<string, {item: SharedItem; sets: Set<number>}>();
    for (const loadout of snapshot.loadouts) {
        const sets = new Set<number>();
        for (const item of loadout.items) {
            const set = setOf(ctx.defOf(item.itemHash));
            if (set) sets.add(set);
        }
        for (const item of loadout.items) {
            const entry = shared.get(item.itemInstanceId) ?? {
                item,
                sets: new Set<number>(),
            };
            for (const set of sets) entry.sets.add(set);
            shared.set(item.itemInstanceId, entry);
        }
    }

    /** L'objet peut-il servir le personnage visé ? */
    const usable = (item: AccountItem, def: InventoryItemDefinition | undefined) => {
        if (!def) return false;
        if (def.nonTransferrable && item.characterId !== characterId) return false;
        return (
            def.classType === undefined ||
            def.classType === CLASS_ANY ||
            classType === undefined ||
            def.classType === classType
        );
    };

    const power = (id: string) =>
        ctx.details[id]?.instance?.primaryStat?.value ?? 0;

    return [...shared.values()].map(({item, sets}) => {
        const own = byId.get(item.itemInstanceId);
        if (own && usable(own, ctx.defOf(own.itemHash))) {
            return {shared: item, kept: true, candidates: [item.itemInstanceId]};
        }

        const sharedDef = ctx.defOf(item.itemHash);
        const sharedSet = setOf(sharedDef);
        const bySet =
            ARMOR_BUCKETS.has(item.bucketHash) &&
            !isExotic(sharedDef) &&
            sets.size > 0;

        const candidates = ctx.items.filter((candidate) => {
            const def = ctx.defOf(candidate.itemHash);
            if (!usable(candidate, def)) return false;
            if (candidate.itemHash === item.itemHash) return true;
            if (!bySet) return false;
            const set = setOf(def);
            return (
                def?.inventory?.bucketTypeHash === item.bucketHash &&
                !isExotic(def) &&
                set !== undefined &&
                sets.has(set)
            );
        });

        // Le même objet d'abord, puis le même ensemble que la pièce partagée,
        // puis la plus puissante : c'est l'ordre dans lequel un joueur
        // chercherait lui-même.
        const rank = (candidate: AccountItem) => [
            candidate.itemHash === item.itemHash ? 0 : 1,
            sharedSet !== undefined && setOf(ctx.defOf(candidate.itemHash)) === sharedSet
                ? 0
                : 1,
            -power(candidate.itemInstanceId),
        ];
        candidates.sort((a, b) => {
            const ra = rank(a);
            const rb = rank(b);
            for (let i = 0; i < ra.length; i++) {
                if (ra[i] !== rb[i]) return ra[i] - rb[i];
            }
            return a.itemInstanceId.localeCompare(b.itemInstanceId);
        });

        return {
            shared: item,
            kept: false,
            candidates: candidates.map((candidate) => candidate.itemInstanceId),
        };
    });
}

/**
 * Le choix proposé d'office : le premier candidat de chaque objet.
 *
 * Avec une nuance : deux objets partagés du même hash — deux tirages d'une même
 * arme, chacun dans ses emplacements — reçoivent si possible **deux**
 * exemplaires distincts. Les rabattre sur le même aurait fait d'un groupe à
 * deux configurations un groupe à une seule, sans que rien ne le montre.
 */
export function defaultPicks(choices: readonly ImportChoice[]): Map<string, string | null> {
    const taken = new Set<string>();
    const picks = new Map<string, string | null>();

    for (const choice of choices) {
        if (choice.kept) taken.add(choice.shared.itemInstanceId);
    }
    for (const choice of choices) {
        if (choice.kept) {
            picks.set(choice.shared.itemInstanceId, choice.shared.itemInstanceId);
            continue;
        }
        const pick =
            choice.candidates.find((id) => !taken.has(id)) ??
            choice.candidates[0] ??
            null;
        if (pick) taken.add(pick);
        picks.set(choice.shared.itemInstanceId, pick);
    }

    return picks;
}

/** Sources d'un socket dont l'attribut se choisit librement sur tout exemplaire. */
const OPEN_SOURCES =
    PLUG_SOURCE.Inventory | PLUG_SOURCE.ProfilePlugSet | PLUG_SOURCE.CharacterPlugSet;

/**
 * Les attributs enregistrés d'un objet partagé, reportés sur l'exemplaire
 * retenu.
 *
 * Ceux du partage décrivent l'objet de l'auteur, et une partie n'a aucun sens
 * sur un autre. Les reporter tous aurait fait refuser l'équipement — et avec
 * lui tout l'emplacement, l'échec d'une étape annulant la suite de son lot.
 * Un socket est donc **écarté** (sentinelle : rien à poser) quand :
 *
 *  - l'attribut est une **pièce maîtresse ou un mémento** : en poser un autre
 *    coûte des matériaux, ce que personne n'a demandé en important ;
 *  - l'exemplaire tire ses options de **son propre tirage** (`reusablePlugs`) et
 *    ne propose pas cet attribut, ni sa version améliorée — un autre roll ;
 *  - le socket est **figé** : ni l'inventaire ni les plug sets n'y apportent
 *    quoi que ce soit (`plugSources`). C'est là que vivent l'archétype et les
 *    statistiques d'une armure, tirés au sort à chaque exemplaire ;
 *  - la pièce retenue n'a **pas la même disposition** de sockets. Relevé sur le
 *    manifeste : six armures d'ensemble sur 168 par emplacement ont des sockets
 *    rangés autrement, et l'index n'y désigne plus le même emplacement.
 *
 * Une valeur déjà en place est toujours gardée : elle ne coûte rien, et un
 * socket que deux emplacements se disputent a besoin d'être demandé partout
 * (voir `volatileSockets` dans `equip.ts`).
 */
export function transferPlugs(
    saved: readonly number[],
    sharedHash: number,
    target: AccountItem,
    ctx: ImportContext,
): number[] {
    const detail = ctx.details[target.itemInstanceId];
    const fromEntries = ctx.defOf(sharedHash)?.sockets?.socketEntries ?? [];
    const toEntries = ctx.defOf(target.itemHash)?.sockets?.socketEntries ?? [];

    return saved.map((plugItemHash, socketIndex) => {
        if (!plugItemHash || plugItemHash === INVALID_HASH) return plugItemHash;
        if (detail?.sockets[socketIndex] === plugItemHash) return plugItemHash;

        const plugDef = ctx.defOf(plugItemHash);
        if (isMasterworkPlug(plugDef) || isFixedPlug(plugDef)) return INVALID_HASH;

        const available = detail?.reusablePlugs?.[String(socketIndex)];
        if (available?.length) {
            const upgraded = upgradedPlug(plugItemHash, available, ctx.defOf);
            return available.includes(upgraded) ? upgraded : INVALID_HASH;
        }

        const from = fromEntries[socketIndex];
        const to = toEntries[socketIndex];
        if (!from || !to) return INVALID_HASH;
        if (
            from.singleInitialItemHash !== to.singleInitialItemHash ||
            from.plugSources !== to.plugSources
        ) {
            return INVALID_HASH;
        }
        return (to.plugSources ?? 0) & OPEN_SOURCES ? plugItemHash : INVALID_HASH;
    });
}

/**
 * Les emplacements du groupe importé.
 *
 * Autant que le personnage en a, comme tout groupe : ceux du partage d'abord,
 * dans leur ordre, puis des emplacements vides. Un partage plus long que le
 * personnage est tronqué — ses derniers emplacements n'auraient nulle part où
 * s'équiper. Un équipement partagé seul devient ainsi un groupe dont seul le
 * premier emplacement est rempli.
 *
 * Un objet laissé sans exemplaire est simplement absent de ses emplacements,
 * comme un objet démantelé : l'équipement s'en passera. Un emplacement qui
 * n'en garde aucun redevient vide.
 */
export function importLoadouts(
    snapshot: SharedSnapshot,
    picks: ImportPicks,
    slotCount: number,
    ctx: ImportContext,
): GroupLoadout[] {
    const byId = new Map(ctx.items.map((item) => [item.itemInstanceId, item]));

    const loadouts = snapshot.loadouts.slice(0, slotCount).map((loadout) => {
        const items = loadout.items.flatMap((item) => {
            const saved = loadout.sockets[item.itemInstanceId] ?? [];
            const picked = picks.get(item.itemInstanceId);
            const target = picked ? byId.get(picked) : undefined;
            if (!target) return [];

            return [
                {
                    itemInstanceId: target.itemInstanceId,
                    // L'objet même de l'auteur : ses attributs enregistrés
                    // valent tels quels.
                    plugItemHashes:
                        target.itemInstanceId === item.itemInstanceId
                            ? [...saved]
                            : transferPlugs(saved, item.itemHash, target, ctx),
                },
            ];
        });

        if (items.length === 0) return emptyGroupLoadout();
        return {
            colorHash: loadout.colorHash,
            iconHash: loadout.iconHash,
            nameHash: loadout.nameHash,
            items,
        };
    });

    while (loadouts.length < slotCount) loadouts.push(emptyGroupLoadout());
    return loadouts;
}

/**
 * Les définitions que l'import doit avoir sous la main.
 *
 * Les objets du partage — l'importateur ne les possède pas forcément, ils ne
 * sont donc pas dans les définitions du profil — et les attributs enregistrés,
 * plus les options des candidats là où l'attribut leur manque : c'est ce que
 * `upgradedPlug` compare pour retrouver une version améliorée.
 */
export function importDefinitionHashes(
    snapshot: SharedSnapshot,
    choices: readonly ImportChoice[],
    details: Record<string, ItemDetail>,
): number[] {
    const hashes = new Set<number>();
    for (const loadout of snapshot.loadouts) {
        for (const item of loadout.items) hashes.add(item.itemHash);
        for (const sockets of Object.values(loadout.sockets)) {
            for (const hash of sockets) {
                if (hash && hash !== INVALID_HASH) hashes.add(hash);
            }
        }
    }
    for (const choice of choices) {
        if (choice.kept) continue;
        for (const id of choice.candidates) {
            for (const options of Object.values(details[id]?.reusablePlugs ?? {})) {
                for (const hash of options) hashes.add(hash);
            }
        }
    }
    return [...hashes];
}
