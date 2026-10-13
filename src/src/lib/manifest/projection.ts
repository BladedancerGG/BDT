// Allègement des tables du manifeste : le serveur ne transmet, de chaque
// définition, que les champs que l'app lit.
//
// Module pur et sans directive : le serveur l'applique (server-cache.ts), le
// client n'en lit que l'empreinte (MANIFEST_SCHEMA_VERSION, dans tables.ts).
//
// Mesuré sur DestinyInventoryItemDefinition (fr) : le JSON passe de 201 Mo à
// ~87 Mo — c'est surtout ce que le navigateur n'a plus à analyser ni à écrire
// en IndexedDB, bien plus que les quelques Mo de transfert gagnés.
//
// Le danger est un champ lu mais retiré : l'interface afficherait du vide, sans
// erreur. D'où le contrôle de couverture en bas de fichier, qui fait échouer
// `tsc` dès qu'une interface de `ManifestReads` déclare un champ que la
// projection ne garde pas — ou l'inverse, un champ gardé que personne ne lit.

import type {
    ClassDefinition,
    DamageTypeDefinition,
    BreakerTypeDefinition,
    EquipableItemSetDefinition,
    InventoryBucketDefinition,
    InventoryItemDefinition,
    LoadoutColorDefinition,
    LoadoutConstantsDefinition,
    LoadoutIconDefinition,
    LoadoutNameDefinition,
    ObjectiveDefinition,
    PlugSetDefinition,
    SandboxPerkDefinition,
    SocketCategoryDefinition,
    StatDefinition,
    StatGroupDefinition,
} from "@/lib/destiny/types";
import type {IconDefinition} from "@/lib/destiny/icons";
import type {ItemConstantsDefinition} from "@/lib/destiny/overlays";
import type {ManifestTable} from "./tables";

/**
 * Ce qu'on garde d'une valeur :
 * - `true` : la valeur entière, telle quelle ;
 * - `[spec]` : un tableau, dont chaque élément est projeté selon `spec` ;
 * - `{champ: spec}` : un objet réduit aux champs listés.
 */
export type FieldSpec = true | readonly [FieldSpec] | {readonly [field: string]: FieldSpec};

/**
 * Type de lecture de chaque table : **toute** lecture d'une définition doit
 * caster `data` vers le type de sa table ici, et rien d'autre — c'est ce qui
 * rend le contrôle de couverture exhaustif. `scripts/checks/projection.check.ts`
 * refuse un cast vers un type absent de cette liste.
 */
export interface ManifestReads {
    DestinyInventoryItemDefinition: InventoryItemDefinition;
    DestinyStatDefinition: StatDefinition;
    DestinyStatGroupDefinition: StatGroupDefinition;
    DestinyDamageTypeDefinition: DamageTypeDefinition;
    DestinyInventoryBucketDefinition: InventoryBucketDefinition;
    DestinyClassDefinition: ClassDefinition;
    DestinySandboxPerkDefinition: SandboxPerkDefinition;
    DestinySocketCategoryDefinition: SocketCategoryDefinition;
    DestinyPlugSetDefinition: PlugSetDefinition;
    DestinyInventoryItemConstantsDefinition: ItemConstantsDefinition;
    DestinyIconDefinition: IconDefinition;
    DestinyEquipableItemSetDefinition: EquipableItemSetDefinition;
    DestinyObjectiveDefinition: ObjectiveDefinition;
    DestinyBreakerTypeDefinition: BreakerTypeDefinition;
    DestinyLoadoutColorDefinition: LoadoutColorDefinition;
    DestinyLoadoutIconDefinition: LoadoutIconDefinition;
    DestinyLoadoutNameDefinition: LoadoutNameDefinition;
    DestinyLoadoutConstantsDefinition: LoadoutConstantsDefinition;
}

// `iconSequences` et `highResIcon` sont retirés : jamais lus, et présents sur
// une bonne part des objets.
const DISPLAY_PROPERTIES = {
    name: true,
    description: true,
    icon: true,
    iconHash: true,
    hasIcon: true,
} as const;

export const MANIFEST_PROJECTION = {
    DestinyInventoryItemDefinition: {
        displayProperties: DISPLAY_PROPERTIES,
        itemType: true,
        itemSubType: true,
        itemTypeDisplayName: true,
        plug: {
            plugCategoryIdentifier: true,
            uiPlugLabel: true,
            energyCost: {energyCost: true, energyType: true},
            energyCapacity: {capacityValue: true},
        },
        hash: true,
        stats: {statGroupHash: true},
        investmentStats: [{statTypeHash: true, value: true, isConditionallyActive: true}],
        perks: [{perkHash: true, perkVisibility: true}],
        traitIds: true,
        iconWatermark: true,
        iconWatermarkFeatured: true,
        isFeaturedItem: true,
        isAdept: true,
        isHolofoil: true,
        nonTransferrable: true,
        equippable: true,
        doesPostmasterPullHaveSideEffects: true,
        classType: true,
        quality: {displayVersionWatermarkIcons: true},
        inventory: {tierType: true, tierTypeName: true, bucketTypeHash: true},
        defaultDamageType: true,
        breakerType: true,
        talentGrid: {hudDamageType: true, buildName: true},
        equippingBlock: {equipableItemSetHash: true, ammoType: true},
        sockets: {
            socketEntries: [
                {
                    singleInitialItemHash: true,
                    reusablePlugSetHash: true,
                    randomizedPlugSetHash: true,
                    reusablePlugItems: [{plugItemHash: true}],
                    plugSources: true,
                },
            ],
            socketCategories: [{socketCategoryHash: true, socketIndexes: true}],
        },
    },
    DestinyStatDefinition: {displayProperties: DISPLAY_PROPERTIES, statCategory: true},
    DestinyStatGroupDefinition: {
        maximumValue: true,
        scaledStats: [
            {statHash: true, maximumValue: true, displayAsNumeric: true, displayInterpolation: true},
        ],
    },
    DestinyDamageTypeDefinition: {
        displayProperties: DISPLAY_PROPERTIES,
        transparentIconPath: true,
        enumValue: true,
    },
    DestinyInventoryBucketDefinition: {displayProperties: DISPLAY_PROPERTIES, itemCount: true},
    DestinyClassDefinition: {displayProperties: DISPLAY_PROPERTIES, classType: true},
    DestinySandboxPerkDefinition: {displayProperties: DISPLAY_PROPERTIES, isDisplayable: true},
    DestinySocketCategoryDefinition: {displayProperties: DISPLAY_PROPERTIES},
    DestinyPlugSetDefinition: {reusablePlugItems: [{plugItemHash: true, currentlyCanRoll: true}]},
    // Une seule entrée de 400 octets : rien à gagner à la découper.
    DestinyInventoryItemConstantsDefinition: true,
    DestinyIconDefinition: {
        foreground: true,
        background: true,
        secondaryBackground: true,
        specialBackground: true,
        highResForeground: true,
    },
    DestinyEquipableItemSetDefinition: {
        displayProperties: DISPLAY_PROPERTIES,
        setItems: true,
        setPerks: [{requiredSetCount: true, sandboxPerkHash: true}],
    },
    DestinyObjectiveDefinition: {
        displayProperties: DISPLAY_PROPERTIES,
        progressDescription: true,
        completionValue: true,
        uiLabel: true,
    },
    DestinyBreakerTypeDefinition: {displayProperties: DISPLAY_PROPERTIES, enumValue: true},
    DestinyLoadoutColorDefinition: {colorImagePath: true},
    DestinyLoadoutIconDefinition: {iconImagePath: true},
    DestinyLoadoutNameDefinition: {name: true},
    // Une seule entrée de 1,5 Ko, dont on lit les trois listes.
    DestinyLoadoutConstantsDefinition: true,
} as const satisfies Record<ManifestTable, FieldSpec>;

/**
 * Réduit une valeur à ce que `spec` en garde.
 *
 * Une valeur qui n'a pas la forme attendue (un scalaire là où la projection
 * attend un objet, un objet là où elle attend un tableau) est gardée **entière** :
 * mieux vaut quelques octets de trop qu'un champ perdu si Bungie change une
 * forme. Un champ absent reste absent — jamais remplacé par `undefined` ni
 * `null`, que certaines lectures distinguent.
 */
export function project(value: unknown, spec: FieldSpec): unknown {
    if (spec === true || value === null || typeof value !== "object") return value;
    if (isArraySpec(spec)) {
        return Array.isArray(value) ? value.map((item) => project(item, spec[0])) : value;
    }
    if (Array.isArray(value)) return value;

    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const field of Object.keys(spec)) {
        if (source[field] !== undefined) out[field] = project(source[field], spec[field]);
    }
    return out;
}

function isArraySpec(spec: FieldSpec): spec is readonly [FieldSpec] {
    return Array.isArray(spec);
}

// —— Contrôle de couverture, à la compilation ————————————————————
//
// Une erreur ici liste le chemin fautif, par exemple :
//   Type '"DestinyInventoryItemDefinition.plug.foo"' does not satisfy the constraint 'never'
// - dans `MissingFields` : le champ est déclaré dans le type de lecture mais
//   retiré par la projection → l'ajouter à MANIFEST_PROJECTION ;
// - dans `UnreadFields` : la projection garde un champ qu'aucun type ne
//   déclare → le retirer, ou le déclarer s'il est bel et bien lu.

type Expect<T extends never> = T;

/** Chemins déclarés par `T` mais retirés par `S`. */
type Missing<S, T, P extends string> = S extends true
    ? never
    : [T] extends [readonly (infer E)[]]
      ? S extends readonly [infer SE]
          ? Missing<SE, NonNullable<E>, `${P}[]`>
          : `${P} (tableau projeté comme un objet)`
      : [T] extends [object]
        ? {
              [K in keyof T & string]-?: K extends keyof S
                  ? Missing<S[K], NonNullable<T[K]>, `${P}.${K}`>
                  : `${P}.${K}`;
          }[keyof T & string]
        : never;

/** Chemins gardés par `S` que `T` ne déclare pas. */
type Unread<S, T, P extends string> = S extends true
    ? never
    : S extends readonly [infer SE]
      ? [T] extends [readonly (infer E)[]]
          ? Unread<SE, NonNullable<E>, `${P}[]`>
          : never
      : {
            [K in keyof S & string]: K extends keyof T
                ? Unread<S[K], NonNullable<T[K]>, `${P}.${K}`>
                : `${P}.${K}`;
        }[keyof S & string];

type Projection = typeof MANIFEST_PROJECTION;

export type EveryTableHasAReadType = Expect<Exclude<ManifestTable, keyof ManifestReads>>;
export type MissingFields = Expect<
    {[K in ManifestTable]: Missing<Projection[K], ManifestReads[K], K>}[ManifestTable]
>;
export type UnreadFields = Expect<
    {[K in ManifestTable]: Unread<Projection[K], ManifestReads[K], K>}[ManifestTable]
>;
