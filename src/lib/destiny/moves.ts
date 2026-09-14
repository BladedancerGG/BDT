// Planification des déplacements d'objets.
//
// Moteur pur : aucune dépendance à React ni au réseau. Il transforme un
// « déplacer cet objet là » en la suite de requêtes Bungie qui y parvient, ou
// en un motif de refus. C'est ici que vivent les limitations de l'API, parce
// qu'elles ne se voient nulle part ailleurs :
//
//  - aucun transfert direct d'un personnage à l'autre : tout passe par le coffre ;
//  - un objet équipé ne se transfère pas, et l'API n'expose aucun
//    « déséquiper » : il faut équiper un autre objet du même emplacement ;
//  - les Objets perdus ne se vident que vers l'inventaire de leur propriétaire ;
//  - doctrines et artéfacts sont `nonTransferrable` : ils ne quittent jamais
//    leur personnage ;
//  - chaque emplacement a une capacité (9 objets rangés + 1 équipé, 6 pour
//    l'artéfact) et le coffre aussi (1300) : une destination pleine fait
//    échouer la requête côté Bungie ;
//  - les objets **non instanciés** — mods, consommables — n'ont pas d'identité
//    côté API : ils se déplacent par pile entière, en désignant leur hash et un
//    `itemId` à « 0 ». Voir `stackId` plus bas.
//
// Les statuts d'erreur renvoyés par Bungie quand on l'ignore
// (`DestinyItemNotTransferrable`, `DestinyNoRoomInDestination`…) sont
// intelligibles, mais arrivent après coup : mieux vaut ne pas envoyer la requête.

import type { MoveStepRequest } from "@/lib/actions/types";
import type { ProfileData } from "@/lib/bungie/use-profile";
import type { DestinyItemComponent } from "@/lib/bungie/profile";
import type { InventoryItemDefinition } from "./types";
import {
  ARMOR_BUCKETS,
  BUCKET,
  DEFAULT_BUCKET_CAPACITY,
  STORAGE_BUCKETS,
  WEAPON_BUCKETS,
} from "./buckets";
import { TIER } from "./display";
import type { BatchFailure } from "@/lib/actions/types";

/** ItemLocation, tel que l'API le renseigne sur chaque objet. */
const LOCATION = { Inventory: 1, Vault: 2 } as const;

/** `classType` d'un objet que n'importe quelle classe peut équiper. */
export const CLASS_ANY = 3;

/** Où se trouve un objet. */
export type ItemPlace =
  | { kind: "vault" }
  | { kind: "inventory"; characterId: string }
  | { kind: "equipped"; characterId: string }
  | { kind: "postmaster"; characterId: string };

/** Où l'utilisateur veut l'envoyer — les Objets perdus ne sont pas une cible. */
export type MoveTarget =
  | { kind: "vault" }
  | { kind: "inventory"; characterId: string }
  | { kind: "equipped"; characterId: string };

// —— Identité d'une pile ————————————————————————————————————————
//
// Un mod, un consommable ou un matériau n'a pas d'`itemInstanceId` : côté
// Bungie, une pile se désigne par son hash, et l'`itemId` de la requête vaut
// « 0 ». Il faut pourtant bien l'identifier ici — la file d'actions, l'attente
// affichée sur la vignette et le contrôle de fraîcheur du profil sont tous
// indexés par une chaîne.
//
// D'où cet identifiant de synthèse, sur le modèle de `matchKey` dans la
// recherche : le hash **et** l'endroit où la pile se trouve, car le même mod
// peut avoir une pile au coffre et une autre dans le rangement partagé. Il est
// résolu contre le profil en cache à la planification, jamais conservé au-delà.

const STACK_PREFIX = "stack:";

/** `itemId` d'un objet non instancié, tel que l'API l'attend. */
export const STACK_ITEM_ID = "0";

/** Identifiant de synthèse d'une pile — voir plus haut. */
export function stackId(itemHash: number, place: ItemPlace): string {
  const where =
    place.kind === "vault" ? "vault" : `${place.kind}:${place.characterId}`;
  return `${STACK_PREFIX}${itemHash}:${where}`;
}

/**
 * Identifiant de la pile qu'une vignette montre, d'après l'emplacement où elle
 * est affichée.
 *
 * C'est la grille qui sait où l'objet se trouve — la vignette, elle, n'a que le
 * `bucketHash` de l'objet. Le rangement partagé n'appartenant à personne, c'est
 * le personnage affiché qui sert de repère : n'importe lequel ferait l'affaire,
 * et l'API en réclame un.
 */
export function stackSubject(
  itemHash: number,
  bucketHash: number | undefined,
  characterId: string | null,
): string | undefined {
  if (bucketHash === undefined) return undefined;
  if (bucketHash === BUCKET.Vault) return stackId(itemHash, { kind: "vault" });
  if (!characterId) return undefined;
  return stackId(itemHash, {
    kind: bucketHash === BUCKET.Postmaster ? "postmaster" : "inventory",
    characterId,
  });
}

/** Vrai si l'identifiant désigne une pile et non une instance. */
export function isStackId(id: string): boolean {
  return id.startsWith(STACK_PREFIX);
}

/** Lecture d'un identifiant de pile, ou `null` si ce n'en est pas un. */
export function parseStackId(
  id: string,
): { itemHash: number; place: ItemPlace } | null {
  if (!isStackId(id)) return null;
  const [hash, kind, characterId] = id.slice(STACK_PREFIX.length).split(":");
  const itemHash = Number(hash);
  if (!Number.isFinite(itemHash)) return null;
  if (kind === "vault") return { itemHash, place: { kind: "vault" } };
  if (!characterId) return null;
  if (kind === "inventory") {
    return { itemHash, place: { kind: "inventory", characterId } };
  }
  if (kind === "postmaster") {
    return { itemHash, place: { kind: "postmaster", characterId } };
  }
  return null;
}

/** Motif de refus, traduit à l'affichage (clés `actions.failure.*`). */
export type MoveFailure =
  | "unknownItem"
  | "notInstanced"
  | "notEquippable"
  | "wrongClass"
  | "nonTransferrable"
  | "noReplacement"
  | "noExoticSwap"
  | "postmasterSideEffects"
  | "vaultFull"
  | "bucketFull"
  /** Aucun personnage : l'API en réclame un, même pour un rangement commun */
  | "noCharacter"
  | BatchFailure;

/** Une requête, enrichie de quoi l'expliquer dans la liste des actions. */
export interface PlannedStep extends MoveStepRequest {
  /**
   * `move` porte sur l'objet déplacé ; `unequip` équipe un remplaçant pour
   * libérer l'objet ; `evict` range un autre objet au coffre pour faire place.
   */
  role: "move" | "unequip" | "evict";
  /** Emplacement d'équipement concerné (pas celui du coffre) */
  bucketHash: number;
  /**
   * Taille de la pile transférée, pour un objet non instancié. Absente
   * ailleurs : une instance est unique par définition.
   */
  stackSize?: number;
  /**
   * Objet que cet équipement va chasser de l'emplacement, s'il y en a un.
   *
   * Il n'apparaît dans aucune requête — l'API n'a pas de « déséquiper », c'est
   * l'équipement du nouvel objet qui le renvoie dans l'inventaire — mais il
   * bouge tout autant, et l'interface doit pouvoir le signaler.
   */
  displaced?: string;
}

export type MovePlan =
  | { ok: true; steps: PlannedStep[] }
  | { ok: false; failure: MoveFailure };

export interface PlanContext {
  profile: ProfileData;
  defs: ReadonlyMap<number, InventoryItemDefinition>;
  /** Capacité par emplacement, objet équipé compris, lue du manifeste */
  capacities: ReadonlyMap<number, number>;
}

// —— Lecture de l'état ————————————————————————————————————————

/** Emplacement d'origine d'un objet, seule source fiable pour ceux du Courrier. */
export function homeBucket(def: InventoryItemDefinition | undefined): number {
  return def?.inventory?.bucketTypeHash ?? 0;
}

/**
 * Retrouve une pile dans le profil, à l'endroit que son identifiant annonce.
 *
 * Le rangement partagé et le coffre arrivent dans le **même** composant
 * (`profileInventory`, ici `profile.vault`) : c'est le `bucketHash` de l'objet
 * qui les sépare — « Général » pour ce qui dort au coffre, son emplacement
 * d'origine pour ce qui est rangé. L'inventaire d'un personnage est consulté
 * d'abord, au cas où Bungie y livrerait ces objets.
 */
function locateStack(
  profile: ProfileData,
  { itemHash, place }: { itemHash: number; place: ItemPlace },
): { item: DestinyItemComponent; place: ItemPlace } | null {
  const isStack = (i: DestinyItemComponent) =>
    !i.itemInstanceId && i.itemHash === itemHash;

  if (place.kind !== "vault") {
    const wantsPostmaster = place.kind === "postmaster";
    const item = (profile.inventory[place.characterId] ?? []).find(
      (i) => isStack(i) && (i.bucketHash === BUCKET.Postmaster) === wantsPostmaster,
    );
    if (item) return { item, place };
    // Le Courrier, lui, n'est nulle part ailleurs : ne pas se rabattre sur le
    // rangement partagé, où une autre pile du même objet peut dormir.
    if (wantsPostmaster) return null;
  }

  const inVault = place.kind === "vault";
  const item = profile.vault.find(
    (i) => isStack(i) && (i.bucketHash === BUCKET.Vault) === inVault,
  );
  return item ? { item, place } : null;
}

/** Retrouve un objet dans le profil — une instance, ou une pile. */
export function locateItem(
  profile: ProfileData,
  itemInstanceId: string,
): { item: DestinyItemComponent; place: ItemPlace } | null {
  const stack = parseStackId(itemInstanceId);
  if (stack) return locateStack(profile, stack);

  for (const [characterId, items] of Object.entries(profile.equipment)) {
    const item = items.find((i) => i.itemInstanceId === itemInstanceId);
    if (item) return { item, place: { kind: "equipped", characterId } };
  }
  for (const [characterId, items] of Object.entries(profile.inventory)) {
    const item = items.find((i) => i.itemInstanceId === itemInstanceId);
    if (item) {
      // Dans l'inventaire du personnage, le Courrier se reconnaît à son bucket
      return {
        item,
        place:
          item.bucketHash === BUCKET.Postmaster
            ? { kind: "postmaster", characterId }
            : { kind: "inventory", characterId },
      };
    }
  }
  const inVault = profile.vault.find((i) => i.itemInstanceId === itemInstanceId);
  if (inVault) return { item: inVault, place: { kind: "vault" } };

  return null;
}

/** Vrai quand l'objet est déjà exactement là où on veut l'envoyer. */
export function isAtTarget(place: ItemPlace, target: MoveTarget): boolean {
  if (target.kind === "vault") return place.kind === "vault";
  if (target.kind === "inventory") {
    return place.kind === "inventory" && place.characterId === target.characterId;
  }
  return place.kind === "equipped" && place.characterId === target.characterId;
}

const isExotic = (def: InventoryItemDefinition | undefined) =>
  def?.inventory?.tierType === TIER.Exotic;

/**
 * Famille soumise à la limite « un seul exotique équipé ».
 *
 * Le jeu autorise **une** arme exotique et **une** pièce d'armure exotique par
 * personnage, indépendamment l'une de l'autre. Doctrine et artéfact n'entrent
 * dans aucune des deux.
 */
function exoticFamily(bucketHash: number): "weapon" | "armor" | null {
  if (WEAPON_BUCKETS.has(bucketHash)) return "weapon";
  if (ARMOR_BUCKETS.has(bucketHash)) return "armor";
  return null;
}

function capacityOf(ctx: PlanContext, bucketHash: number): number {
  return ctx.capacities.get(bucketHash) ?? DEFAULT_BUCKET_CAPACITY;
}

/** Objets rangés (non équipés) d'un personnage dans un emplacement donné. */
function stored(
  profile: ProfileData,
  characterId: string,
  bucketHash: number,
): DestinyItemComponent[] {
  return (profile.inventory[characterId] ?? []).filter(
    (i) => i.bucketHash === bucketHash,
  );
}

/**
 * Ordre de sacrifice : ce qu'on déplace le plus volontiers en premier.
 *
 * Les exotiques passent en dernier — en équiper un peut en faire sauter un
 * autre, ce que l'utilisateur n'a pas demandé. À rareté égale, on prend la
 * puissance la plus faible : c'est l'objet le moins susceptible d'être utilisé.
 */
function sacrificeOrder(ctx: PlanContext, items: DestinyItemComponent[]) {
  return [...items].sort((a, b) => {
    const exoticA = isExotic(ctx.defs.get(a.itemHash));
    const exoticB = isExotic(ctx.defs.get(b.itemHash));
    if (exoticA !== exoticB) return exoticA ? 1 : -1;

    const powerA = a.itemInstanceId
      ? (ctx.profile.items[a.itemInstanceId]?.instance?.primaryStat?.value ?? 0)
      : 0;
    const powerB = b.itemInstanceId
      ? (ctx.profile.items[b.itemInstanceId]?.instance?.primaryStat?.value ?? 0)
      : 0;
    return powerA - powerB;
  });
}

// —— Planification ————————————————————————————————————————————

/**
 * Suite de requêtes menant l'objet à destination, ou motif de refus.
 *
 * Un plan vide signifie que l'objet est déjà à sa place — ce n'est pas une
 * erreur, il n'y a simplement rien à envoyer.
 */
/**
 * Déplacement d'une pile : mods, consommables, matériaux.
 *
 * Trois écarts avec un objet instancié, et ils tiennent tous à la nature de ces
 * emplacements :
 *
 *  - **ils sont de portée compte** (`scope: 1` dans le manifeste, voir
 *    STORAGE_BUCKETS) : la pile est commune aux trois personnages. Viser
 *    l'inventaire de l'un ou de l'autre revient au même, et l'API réclame
 *    pourtant un personnage — celui qui sert de porte d'entrée ;
 *  - **rien ne s'y équipe**, et il n'y a donc jamais de remplaçant à trouver ;
 *  - **rien ne s'en évince** : ranger un mod au coffre pour faire de la place à
 *    un autre n'est pas un service à rendre. Une destination pleine est un
 *    refus, pas un travail supplémentaire.
 *
 * La pile part entière, sauf si `amount` dit combien en prendre : le dépôt d'une
 * pile de plus d'un exemplaire ouvre un sélecteur de quantité (voir
 * `AmountPrompt`), et c'est de là que vient ce nombre.
 */
function planStackMove(
  item: DestinyItemComponent,
  place: ItemPlace,
  target: MoveTarget,
  ctx: PlanContext,
  def: InventoryItemDefinition,
  amount?: number,
): MovePlan {
  if (target.kind === "equipped") return { ok: false, failure: "notEquippable" };
  if (def.nonTransferrable) return { ok: false, failure: "nonTransferrable" };

  const bucketHash = homeBucket(def);
  const shared = STORAGE_BUCKETS.includes(bucketHash);
  // La quantité demandée, ramenée à ce que la pile contient. Absente, elle part
  // entière — c'est ce que fait le double-clic, qui ne demande rien.
  const stackSize = Math.max(
    1,
    Math.min(amount ?? item.quantity, Math.max(1, item.quantity)),
  );
  const steps: PlannedStep[] = [];
  // L'identifiant d'une pile porte l'endroit où elle se trouve : il change donc
  // d'une étape à l'autre. C'est ce qui permet à `applyStep` de la retrouver
  // pour rejouer la seconde — le retrait du Courrier l'ayant déjà déplacée.
  let from = place;
  const step = (
    kind: MoveStepRequest["kind"],
    characterId: string,
    inBucket: number,
    next: ItemPlace,
  ) => {
    steps.push({
      kind,
      role: "move",
      bucketHash: inBucket,
      characterId,
      itemHash: item.itemHash,
      itemInstanceId: stackId(item.itemHash, from),
      stackSize,
    });
    from = next;
  };

  // Le personnage qui sert d'intermédiaire : celui que vise le dépôt, ou celui
  // qui détient déjà la pile.
  const holder =
    target.kind === "inventory"
      ? target.characterId
      : place.kind !== "vault"
        ? place.characterId
        : ctx.profile.characters[0]?.characterId;
  if (!holder) return { ok: false, failure: "noCharacter" };

  // —— Sortir des Objets perdus ————————————————————————————————
  if (place.kind === "postmaster") {
    if (def.doesPostmasterPullHaveSideEffects) {
      return { ok: false, failure: "postmasterSideEffects" };
    }
    if (!hasRoomForStack(ctx, item, bucketHash)) {
      return { ok: false, failure: "bucketFull" };
    }
    step("pull", place.characterId, bucketHash, {
      kind: "inventory",
      characterId: holder,
    });
    // Le retrait dépose la pile dans le rangement, commun : viser l'inventaire
    // s'arrête là.
    if (target.kind === "inventory") return { ok: true, steps };
  }

  // —— Rejoindre le bon conteneur ——————————————————————————————
  const atVault = place.kind === "vault";
  if (target.kind === "vault") {
    if (atVault) return { ok: true, steps };
    if (!hasRoomForStack(ctx, item, BUCKET.Vault)) {
      return { ok: false, failure: "vaultFull" };
    }
    step("toVault", holder, BUCKET.Vault, { kind: "vault" });
    return { ok: true, steps };
  }

  // Cible : le rangement. Une pile qui y est déjà n'a nulle part où aller — le
  // rangement étant commun, changer de personnage ne la déplacerait pas.
  if (!atVault) return { ok: true, steps };
  if (!shared) return { ok: false, failure: "nonTransferrable" };
  if (!hasRoomForStack(ctx, item, bucketHash)) {
    return { ok: false, failure: "bucketFull" };
  }
  step("fromVault", holder, bucketHash, {
    kind: "inventory",
    characterId: holder,
  });
  return { ok: true, steps };
}

/**
 * L'emplacement visé peut-il recevoir cette pile ?
 *
 * Une pile qui rejoint une pile du même objet **fusionne** : elle n'occupe
 * alors aucune place neuve, et une destination pleine l'accepte quand même.
 * Les objets rangés comme ceux du coffre vivent dans `profile.vault` : c'est
 * leur `bucketHash` qui les compte.
 */
function hasRoomForStack(
  ctx: PlanContext,
  item: DestinyItemComponent,
  bucketHash: number,
): boolean {
  const here = ctx.profile.vault.filter((i) => i.bucketHash === bucketHash);
  if (here.some((i) => !i.itemInstanceId && i.itemHash === item.itemHash)) {
    return true;
  }

  // Capacité inconnue : ne rien refuser. La valeur par défaut du planificateur
  // vaut dix, celle d'une arme, et n'a rien à voir avec les cinquante places du
  // rangement partagé — s'en servir ici inventait des refus. Mieux vaut laisser
  // Bungie trancher que mentir à l'utilisateur.
  const capacity = ctx.capacities.get(bucketHash);
  return capacity === undefined || here.length < capacity;
}

export function planMove(
  itemInstanceId: string,
  target: MoveTarget,
  ctx: PlanContext,
  /**
   * Combien d'exemplaires déplacer, pour une pile. Absent : toute la pile. Sans
   * effet sur un objet instancié, qui est unique par définition.
   */
  stackSize?: number,
): MovePlan {
  const found = locateItem(ctx.profile, itemInstanceId);
  if (!found) return { ok: false, failure: "notInstanced" };

  const { item, place } = found;
  const def = ctx.defs.get(item.itemHash);
  if (!def) return { ok: false, failure: "unknownItem" };

  if (isAtTarget(place, target)) return { ok: true, steps: [] };

  // Une pile ne suit pas le même chemin : jamais d'équipement, jamais
  // d'éviction pour faire de la place, et un seul transfert.
  if (!item.itemInstanceId) {
    return planStackMove(item, place, target, ctx, def, stackSize);
  }

  const bucketHash = homeBucket(def);
  const steps: PlannedStep[] = [];
  const step = (
    kind: MoveStepRequest["kind"],
    subject: DestinyItemComponent,
    characterId: string,
    role: PlannedStep["role"],
    // Une étape peut porter sur un AUTRE emplacement que celui de l'objet
    // déplacé — c'est le cas du déséquipement d'un exotique concurrent.
    inBucket: number = bucketHash,
  ) => {
    // L'occupant actuel de l'emplacement visé, lu sur l'instantané de profil :
    // le plan ne l'a pas encore modifié, et aucune étape antérieure ne touche
    // deux fois le même emplacement.
    const displaced =
      kind === "equip"
        ? (ctx.profile.equipment[characterId] ?? []).find(
            (equipped) =>
              equipped.bucketHash === inBucket &&
              equipped.itemInstanceId !== subject.itemInstanceId,
          )?.itemInstanceId
        : undefined;

    steps.push({
      kind,
      role,
      bucketHash: inBucket,
      characterId,
      itemHash: subject.itemHash,
      itemInstanceId: subject.itemInstanceId!,
      displaced,
    });
  };

  // Compteurs mis à jour au fil du plan : plusieurs étapes se disputent la
  // même place, la capacité doit se lire après les précédentes.
  const vaultCapacity = capacityOf(ctx, BUCKET.Vault);
  let vaultCount = ctx.profile.vault.filter(
    (i) => i.bucketHash === BUCKET.Vault,
  ).length;
  const storedCount = new Map<string, number>();
  const countKey = (characterId: string) => `${characterId}:${bucketHash}`;
  const countOf = (characterId: string) => {
    const key = countKey(characterId);
    const known = storedCount.get(key);
    if (known !== undefined) return known;
    const value = stored(ctx.profile, characterId, bucketHash).length;
    storedCount.set(key, value);
    return value;
  };
  const bump = (characterId: string, delta: number) =>
    storedCount.set(countKey(characterId), countOf(characterId) + delta);

  // Capacité rangée : la capacité du manifeste compte l'objet équipé
  const storedCapacity = Math.max(0, capacityOf(ctx, bucketHash) - 1);

  /** Range un objet du personnage au coffre pour libérer une place. */
  const makeRoom = (characterId: string): MoveFailure | null => {
    if (countOf(characterId) < storedCapacity) return null;
    const candidates = sacrificeOrder(
      ctx,
      stored(ctx.profile, characterId, bucketHash).filter(
        (i) => i.itemInstanceId !== itemInstanceId,
      ),
    );
    const evicted = candidates[0];
    if (!evicted?.itemInstanceId) return "bucketFull";
    if (vaultCount >= vaultCapacity) return "vaultFull";

    step("toVault", evicted, characterId, "evict");
    vaultCount += 1;
    bump(characterId, -1);
    return null;
  };

  // —— 1. Sortir des Objets perdus ————————————————————————————
  // Seule destination possible : l'inventaire du personnage qui les détient.
  let holder: string | null = null; // null = le coffre
  if (place.kind === "postmaster") {
    if (def.doesPostmasterPullHaveSideEffects) {
      return { ok: false, failure: "postmasterSideEffects" };
    }
    const failure = makeRoom(place.characterId);
    if (failure) return { ok: false, failure };

    step("pull", item, place.characterId, "move");
    bump(place.characterId, 1);
    holder = place.characterId;
  } else if (place.kind === "vault") {
    holder = null;
  } else {
    holder = place.characterId;
  }

  // —— 2. Libérer l'objet s'il est équipé ————————————————————
  // L'API n'a pas de « déséquiper » : on équipe un remplaçant du même
  // emplacement, ce qui renvoie l'objet dans l'inventaire du personnage.
  if (
    place.kind === "equipped" &&
    !(target.kind === "equipped" && target.characterId === place.characterId)
  ) {
    const replacement = sacrificeOrder(
      ctx,
      stored(ctx.profile, place.characterId, bucketHash),
    )[0];
    if (!replacement?.itemInstanceId) {
      return { ok: false, failure: "noReplacement" };
    }
    step("equip", replacement, place.characterId, "unequip");
    // Le remplaçant quitte l'inventaire, l'objet libéré y entre : à somme nulle
  }

  // —— 3. Rejoindre le bon conteneur ————————————————————————
  const destination = target.kind === "vault" ? null : target.characterId;
  if (destination !== holder) {
    if (def.nonTransferrable) return { ok: false, failure: "nonTransferrable" };

    if (holder !== null) {
      if (vaultCount >= vaultCapacity) return { ok: false, failure: "vaultFull" };
      step("toVault", item, holder, "move");
      vaultCount += 1;
      bump(holder, -1);
    }
    if (destination !== null) {
      const failure = makeRoom(destination);
      if (failure) return { ok: false, failure };
      step("fromVault", item, destination, "move");
      vaultCount -= 1;
      bump(destination, 1);
    }
  }

  // —— 4. Équiper ————————————————————————————————————————————
  if (target.kind === "equipped") {
    if (def.equippable === false) return { ok: false, failure: "notEquippable" };
    const character = ctx.profile.characters.find(
      (c) => c.characterId === target.characterId,
    );
    if (
      def.classType !== undefined &&
      def.classType !== CLASS_ANY &&
      character &&
      character.classType !== def.classType
    ) {
      return { ok: false, failure: "wrongClass" };
    }

    // —— Un seul exotique par famille ————————————————————————
    //
    // Le jeu n'accepte qu'une arme et qu'une pièce d'armure exotiques à la
    // fois. Occuper un AUTRE emplacement de la même famille impose donc de
    // libérer l'exotique en place d'abord — et l'API n'ayant pas de
    // « déséquiper », cela passe encore par l'équipement d'un remplaçant.
    //
    // Un exotique déjà dans l'emplacement visé, lui, n'a rien à faire : il sera
    // simplement remplacé.
    const family = isExotic(def) ? exoticFamily(bucketHash) : null;
    if (family) {
      const rival = (ctx.profile.equipment[target.characterId] ?? []).find(
        (equipped) =>
          equipped.bucketHash !== bucketHash &&
          exoticFamily(equipped.bucketHash) === family &&
          isExotic(ctx.defs.get(equipped.itemHash)),
      );

      if (rival) {
        // Le remplaçant doit être NON exotique, sinon le conflit se déplace
        // simplement d'un emplacement à l'autre.
        const replacement = sacrificeOrder(
          ctx,
          stored(ctx.profile, target.characterId, rival.bucketHash),
        ).find(
          (candidate) =>
            candidate.itemInstanceId && !isExotic(ctx.defs.get(candidate.itemHash)),
        );
        if (!replacement) return { ok: false, failure: "noExoticSwap" };

        step(
          "equip",
          replacement,
          target.characterId,
          "unequip",
          rival.bucketHash,
        );
      }
    }

    step("equip", item, target.characterId, "move");
  }

  return { ok: true, steps };
}

// —— Application au profil en cache ————————————————————————————
//
// Recharger le profil (~1,6 Mo) après chaque requête serait ruineux : une seule
// action en enchaîne jusqu'à quatre. On rejoue donc l'effet localement, et le
// profil n'est réellement rechargé qu'une fois la file vidée.

function without(
  items: DestinyItemComponent[] | undefined,
  itemInstanceId: string,
): DestinyItemComponent[] {
  return (items ?? []).filter((i) => i.itemInstanceId !== itemInstanceId);
}

/**
 * Déplace une pile d'une liste à l'autre, en **fusionnant** avec celle qui
 * l'attend peut-être à l'arrivée.
 *
 * C'est ce que fait le jeu : deux piles du même objet au même endroit n'existent
 * pas. Sans la fusion, la grille en aurait affiché deux, et la suivante aurait
 * été planifiée contre la mauvaise.
 */
function addStack(
  items: readonly DestinyItemComponent[],
  source: DestinyItemComponent,
  amount: number,
  bucketHash: number,
  location: number,
): DestinyItemComponent[] {
  const merged = items.find(
    (i) =>
      !i.itemInstanceId &&
      i.itemHash === source.itemHash &&
      i.bucketHash === bucketHash,
  );
  if (merged) {
    return items.map((i) =>
      i === merged ? { ...i, quantity: i.quantity + amount } : i,
    );
  }
  return [...items, { ...source, quantity: amount, bucketHash, location }];
}

/**
 * Retire d'une liste ce qui vient de partir : la pile entière, ou seulement la
 * part transférée.
 */
function takeFromStack(
  items: readonly DestinyItemComponent[],
  source: DestinyItemComponent,
  amount: number,
): DestinyItemComponent[] {
  const remaining = source.quantity - amount;
  return remaining > 0
    ? items.map((i) => (i === source ? { ...i, quantity: remaining } : i))
    : items.filter((i) => i !== source);
}

/**
 * Même chose pour une pile — voir `applyStep`.
 *
 * Le rangement partagé et le coffre vivent dans la **même** liste
 * (`profileInventory`) : un transfert entre les deux n'y change que le
 * `bucketHash`, il ne fait pas passer l'objet d'un tableau à l'autre. Seul le
 * retrait du Courrier en fait bouger deux.
 */
function applyStackStep(
  profile: ProfileData,
  step: PlannedStep,
): ProfileData {
  const found = locateItem(profile, step.itemInstanceId);
  if (!found) return profile;
  const { item, place } = found;

  const next: ProfileData = {
    ...profile,
    equipment: { ...profile.equipment },
    inventory: { ...profile.inventory },
    vault: profile.vault,
  };

  const toVault = step.kind === "toVault";
  const bucketHash = toVault ? BUCKET.Vault : step.bucketHash;
  const location = toVault ? LOCATION.Vault : LOCATION.Inventory;
  // Une part seulement, parfois : le reste demeure là où il était.
  const amount = Math.min(step.stackSize ?? item.quantity, item.quantity);

  if (place.kind === "postmaster") {
    next.inventory[place.characterId] = takeFromStack(
      profile.inventory[place.characterId] ?? [],
      item,
      amount,
    );
    next.vault = addStack(profile.vault, item, amount, bucketHash, location);
    return next;
  }

  next.vault = addStack(
    takeFromStack(profile.vault, item, amount),
    item,
    amount,
    bucketHash,
    location,
  );
  return next;
}

/** Reflète l'effet d'une étape réussie sur le profil en cache. */
export function applyStep(
  profile: ProfileData,
  step: PlannedStep,
): ProfileData {
  if (isStackId(step.itemInstanceId)) return applyStackStep(profile, step);

  const { itemInstanceId, characterId, bucketHash } = step;
  const next: ProfileData = {
    ...profile,
    equipment: { ...profile.equipment },
    inventory: { ...profile.inventory },
    vault: profile.vault,
  };

  switch (step.kind) {
    case "pull": {
      // L'objet reste dans l'inventaire du personnage, mais quitte le Courrier
      next.inventory[characterId] = (profile.inventory[characterId] ?? []).map(
        (i) =>
          i.itemInstanceId === itemInstanceId
            ? { ...i, bucketHash, location: LOCATION.Inventory }
            : i,
      );
      return next;
    }

    case "toVault": {
      const item = (profile.inventory[characterId] ?? []).find(
        (i) => i.itemInstanceId === itemInstanceId,
      );
      if (!item) return profile;
      next.inventory[characterId] = without(
        profile.inventory[characterId],
        itemInstanceId,
      );
      next.vault = [
        ...profile.vault,
        { ...item, bucketHash: BUCKET.Vault, location: LOCATION.Vault },
      ];
      return next;
    }

    case "fromVault": {
      const item = profile.vault.find(
        (i) => i.itemInstanceId === itemInstanceId,
      );
      if (!item) return profile;
      next.vault = without(profile.vault, itemInstanceId);
      next.inventory[characterId] = [
        ...(profile.inventory[characterId] ?? []),
        { ...item, bucketHash, location: LOCATION.Inventory },
      ];
      return next;
    }

    case "equip": {
      const item = (profile.inventory[characterId] ?? []).find(
        (i) => i.itemInstanceId === itemInstanceId,
      );
      if (!item) return profile;
      const equipped = profile.equipment[characterId] ?? [];
      // L'objet jusque-là équipé retourne dans l'inventaire : c'est le seul
      // moyen qu'a l'API de déséquiper, et il faut le refléter ici aussi.
      const displaced = equipped.find((i) => i.bucketHash === item.bucketHash);

      next.equipment[characterId] = [
        ...equipped.filter((i) => i.bucketHash !== item.bucketHash),
        item,
      ];
      next.inventory[characterId] = [
        ...without(profile.inventory[characterId], itemInstanceId),
        ...(displaced ? [displaced] : []),
      ];
      return next;
    }
  }
}
