"use client";

import type {CSSProperties} from "react";
import {useTranslations} from "next-intl";
import {useDefinition} from "@/lib/manifest/use-definition";
import {useItemData} from "@/lib/bungie/use-item-data";
import {useSocketColumns, useTrackerPlugs} from "@/lib/destiny/use-sockets";
import type {
    InventoryItemDefinition,
    SocketCategoryDefinition,
} from "@/lib/destiny/types";
import type {ItemDetail} from "@/lib/bungie/item";
import {
    tierColor,
    damageColor,
    ITEM_TYPE,
    ITEM_SUBTYPE,
    SOCKET_CATEGORY,
    WEAPON_STAT,
} from "@/lib/destiny/display";
import {
    orderStats,
    WEAPON_STAT_ORDER,
    SWORD_STAT_ORDER,
    ARMOR_STAT_ORDER,
} from "@/lib/destiny/stat-order";
import {
    ARTIFACT_SOCKET_CATEGORIES,
    isPlugApplied,
} from "@/lib/destiny/sockets";
import {subclassDamageType, isSubclass} from "@/lib/destiny/subclass";
import {useItemProgress} from "@/lib/destiny/use-item-progress";
import {useStatBonuses} from "@/lib/destiny/use-stat-bonuses";
import {useArmorPerks} from "@/lib/destiny/use-armor-perks";
import {useInsertPlanner} from "@/lib/actions/use-insert-planner";
import {usePlugActionState, type QueuedItem} from "@/lib/actions/store";
import {PlugIcon} from "./PlugIcon";
import {StatBar} from "./StatBar";
import {TooltipSkeleton} from "./TooltipSkeleton";
import {SubclassSockets} from "./SubclassSockets";
import {SetBonus} from "./SetBonus";
import {TooltipHeader} from "./TooltipHeader";
import {WeaponSummary} from "./WeaponSummary";
import {WeaponArchetype} from "./WeaponArchetype";
import {ArmorArchetype} from "./ArmorArchetype";
import {ArmorIntrinsic} from "./ArmorIntrinsic";

/**
 * Attributs d'un artéfact.
 *
 * Leurs quatre catégories de sockets n'ont aucun nom dans le manifeste : on
 * regroupe donc tout sous un libellé traduit. Les emplacements encore vides
 * (« Mod d'artéfact vide ») sont écartés.
 */
function ArtifactPerks({
                           def,
                           detail,
                       }: {
    def: InventoryItemDefinition;
    detail: ItemDetail | undefined;
}) {
    const t = useTranslations("item");
    const hidden = new Set(detail?.hiddenSockets ?? []);

    const equipped = ARTIFACT_SOCKET_CATEGORIES.flatMap((categoryHash) => {
        const category = def.sockets?.socketCategories?.find(
            (c) => c.socketCategoryHash === categoryHash,
        );
        if (!category) return [];

        return category.socketIndexes.flatMap((index) => {
            // Un socket masqué en jeu n'a pas à apparaître ici non plus
            if (hidden.has(index)) return [];
            const plugHash = detail?.sockets?.[index];
            if (!plugHash || plugHash <= 0) return [];
            if (!isPlugApplied(def, index, plugHash)) return [];
            return [plugHash];
        });
    });

    if (equipped.length === 0) return null;

    return (
        <div className="socket-section">
            {/*<span className="socket-section__title">{t("artifactPerks")}</span>*/}
            <div className="socket-section__row">
                {equipped.map((hash, i) => (
                    <PlugIcon key={`${hash}-${i}`} hash={hash} square/>
                ))}
            </div>
        </div>
    );
}

/** Nom d'une catégorie de sockets ("Perks d'arme", "Mods d'armure"…). */
function useCategoryName(categoryHash: number): string {
    const def = useDefinition<SocketCategoryDefinition>(
        "DestinySocketCategoryDefinition",
        categoryHash,
    );
    return def?.displayProperties?.name ?? "";
}

/**
 * Perks affichés en colonnes : une colonne par socket, avec TOUTES les options
 * équipables ; celle en place est mise en avant.
 *
 * Une colonne qui n'offre qu'un seul choix ne se clique pas : il n'y a rien à
 * changer. Les sockets verrouillés non plus.
 */
function PerkColumns({
                         def,
                         detail,
                         item,
                         categoryHash,
                     }: {
    def: InventoryItemDefinition;
    detail: ItemDetail | undefined;
    /** L'arme telle qu'elle part en file — ses habillages compris, pour que la
        carte du panneau puisse redessiner sa vignette. */
    item?: QueuedItem;
    categoryHash: number;
}) {
    const t = useTranslations("actions");
    const all = useSocketColumns(def, detail, categoryHash);
    const title = useCategoryName(categoryHash);
    const insert = useInsertPlanner();
    const {pendingSocket, pendingPlug, error, failure} =
        usePlugActionState(item?.itemInstanceId);
    const disabled = new Set(detail?.disabledSockets ?? []);

    // Le compte-frags occupe une colonne de cette catégorie sans être un
    // attribut : le compte est déjà repris dans le résumé de l'arme, l'icône
    // n'ajoute rien.
    const trackers = useTrackerPlugs(
        all.map((c) => c.equippedHash ?? c.options[0]).filter(Boolean) as number[],
    );
    const columns = all.filter(
        (c) => !trackers.has(c.equippedHash ?? c.options[0]),
    );

    if (columns.length === 0) return null;

    return (
        <div className="socket-section">
            {/*<span className="socket-section__title">{title}</span>*/}
            <div className="socket-section__columns">
                {columns.map((column) => {
                    // Toutes les colonnes sont figées le temps de la réponse :
                    // le hook ne suit qu'une insertion, et Bungie limite de
                    // toute façon le débit des écritures sur un même compte.
                    const changeable =
                        Boolean(item) &&
                        column.options.length > 1 &&
                        !disabled.has(column.socketIndex) &&
                        pendingSocket === undefined;

                    return (
                        <div key={column.socketIndex} className="socket-column">
                            {column.options.map((hash) => (
                                <PlugIcon
                                    key={hash}
                                    hash={hash}
                                    state={hash === column.equippedHash ? "equipped" : "available"}
                                    // Seules ces colonnes contiennent des attributs
                                    // améliorés ; ailleurs le marquage n'a pas de sens.
                                    markEnhanced
                                    onEquip={
                                        item && changeable && hash !== column.equippedHash
                                            ? () => insert(item, column.socketIndex, hash)
                                            : undefined
                                    }
                                    busy={
                                        pendingSocket === column.socketIndex &&
                                        pendingPlug === hash
                                    }
                                />
                            ))}
                        </div>
                    );
                })}
            </div>

            {/* Le refus est aussi dans le panneau des actions, mais c'est ici
                qu'on vient de cliquer : le motif doit être sous les yeux. Le
                plus fréquent — « ce changement n'est pas gratuit » — vient de
                Bungie, déjà localisé. */}
            {(error || failure) && (
                <p className="socket-section__error">
                    {failure ? t(`failure.${failure}`) : error}
                </p>
            )}
        </div>
    );
}

/** Sockets affichés en simple ligne (mods, cosmétiques) : plugs équipés. */
function PlugRow({
                     def,
                     detail,
                     categoryHash,
                     square = true,
                 }: {
    def: InventoryItemDefinition;
    detail: ItemDetail | undefined;
    categoryHash: number;
    square?: boolean;
}) {
    const columns = useSocketColumns(def, detail, categoryHash);
    const title = useCategoryName(categoryHash);

    const plugs = columns
        .map((c) => c.equippedHash)
        .filter((h): h is number => Boolean(h));
    // Même écart que dans les colonnes d'attributs : certaines armes portent
    // leur compteur dans une catégorie affichée en rangée.
    const trackers = useTrackerPlugs(plugs);
    const equipped = plugs.filter((h) => !trackers.has(h));

    if (equipped.length === 0) return null;

    return (
        <div className="socket-section">
            {/*<span className="socket-section__title">{title}</span>*/}
            <div className="socket-section__row">
                {equipped.map((hash, i) => (
                    <PlugIcon key={`${hash}-${i}`} hash={hash} square={square}/>
                ))}
            </div>
        </div>
    );
}

export function ItemTooltip({
                                itemHash,
                                itemInstanceId,
                                state,
                                versionNumber,
                                gearTier,
                            }: {
    itemHash: number;
    itemInstanceId?: string;
    state?: number;
    versionNumber?: number;
    gearTier?: number;
}) {
    const t = useTranslations("item");
    const def = useDefinition<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        itemHash,
    );
    // Servi depuis le préchargement du profil dans le cas normal — donc sans
    // attente. Le squelette ne s'affiche que pour un objet absent du profil,
    // qu'il faut alors aller chercher à l'unité.
    const {detail, pending: awaitingDetail} = useItemData(itemInstanceId);
    const intrinsic = useSocketColumns(def, detail, SOCKET_CATEGORY.INTRINSIC);
    // Niveau d'arme façonnée et compte-frags (composant 309)
    const progress = useItemProgress(detail);
    // Part des statistiques due à la pièce maîtresse et à l'archétype, pour la
    // détacher en fin de barre
    const statBonuses = useStatBonuses(detail);
    // Archétype d'armure et, sur une exotique, l'attribut qui la définit
    const armorPerks = useArmorPerks(detail);

    if (!def) {
        return (
            <div className="item-tooltip">
                <p className="item-tooltip__loading">{t("loading")}</p>
            </div>
        );
    }

    const isWeapon = def.itemType === ITEM_TYPE.Weapon;
    const isArmor = def.itemType === ITEM_TYPE.Armor;

    const power = detail?.instance?.primaryStat?.value;
    // Les doctrines portent leur élément dans talentGrid.hudDamageType, pas dans
    // defaultDamageType (toujours 0 chez elles).
    const subclassElement = subclassDamageType(def);
    const damage =
        subclassElement ?? detail?.instance?.damageType ?? def.defaultDamageType;
    const archetypeHash = intrinsic[0]?.equippedHash;

    // Stats : armure = toujours affichées ; arme = uniquement une fois épinglé.
    // L'ordre suit celui du jeu et dépend du type d'objet — les épées ont leur
    // propre jeu de statistiques.
    const isSword = def.itemSubType === ITEM_SUBTYPE.Sword;
    // Une doctrine expose les mêmes statistiques qu'une armure : ce sont les
    // écarts apportés par ses fragments, déjà totalisés par l'API.
    const isSubclassItem = isSubclass(def);
    const statOrder =
        isArmor || isSubclassItem
            ? ARMOR_STAT_ORDER
            : isSword
                ? SWORD_STAT_ORDER
                : WEAPON_STAT_ORDER;
    const statEntries = orderStats(detail?.stats ?? {}, statOrder);
    // Tout est affiché d'emblée : l'infobulle ne s'ouvre plus qu'au clic, donc
    // elle est toujours volontaire — plus de version « survol » abrégée.
    const showStats = isArmor || isSubclassItem || isWeapon;
    // Les stats d'arme sont sur 100 ; celles d'armure varient → échelle relative.
    // Les valeurs sans barre (cadence, chargeur…) sont exclues du maximum, sinon
    // une cadence de 900 écraserait toutes les autres barres.
    const statMax = isWeapon
        ? 100
        : statEntries.reduce(
            (max, stat) => (stat.withBar ? Math.max(max, stat.value) : max),
            1,
        );

    const rpm = detail?.stats?.[WEAPON_STAT.RPM];
    const impact = detail?.stats?.[WEAPON_STAT.IMPACT];
    const energy = detail?.instance?.energy;

    return (
        <div
            className="item-tooltip"
            style={
                {
                    // Pour une doctrine élémentaire, l'accent et le fond de l'en-tête
                    // suivent la couleur de son élément plutôt que sa rareté.
                    "--tier-color":
                        subclassElement !== undefined
                            ? damageColor(subclassElement)
                            : tierColor(def.inventory?.tierType),
                    "--damage-color": damageColor(damage),
                } as CSSProperties
            }
        >
            {/* Nom, type et rareté, avec filigrane et palier d'équipement à droite.
                La vignette n'y figure plus : l'infobulle est ancrée à l'icône de
                l'objet, qui reste sous les yeux. */}
            <TooltipHeader
                def={def}
                state={state}
                versionNumber={versionNumber}
                gearTier={gearTier}
            />

            <div className="item-tooltip__body">
                {awaitingDetail ? (
                    <TooltipSkeleton
                        kind={isWeapon ? "weapon" : isArmor ? "armor" : "other"}
                    />
                ) : (
                    <>
                        {/* Puissance et élément, munitions, niveau d'arme, compte-frags */}
                        {isWeapon && (
                            <WeaponSummary
                                damageType={damage}
                                power={power}
                                ammoType={def.equippingBlock?.ammoType}
                                progress={progress}
                            />
                        )}

                        {/* Hors des armes : puissance, et pour une armure son
                            archétype — à la place qu'occupent les munitions sur
                            une arme. */}
                        {!isWeapon && (power != null || armorPerks.archetypeHash) && (
                            <div className="item-tooltip__power">
                                {power != null && (
                                    <span className="item-tooltip__power-value">{power}</span>
                                )}
                                {armorPerks.archetypeHash && (
                                    <ArmorArchetype hash={armorPerks.archetypeHash}/>
                                )}
                            </div>
                        )}

                        {/* Statistiques */}
                        {showStats && statEntries.length > 0 && (
                            <div className="item-tooltip__stats">
                                {statEntries.map((stat) => (
                                    <StatBar
                                        key={stat.statHash}
                                        statHash={stat.statHash}
                                        value={stat.value}
                                        // Doctrine : ce sont des écarts (0, ±10), une barre n'aurait
                                        // pas de sens — on les affiche signés.
                                        withBar={stat.withBar && !isSubclassItem}
                                        signed={isSubclassItem}
                                        max={statMax}
                                        bonus={statBonuses[stat.statHash]}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Capacité d'énergie (armure) */}
                        {isArmor && energy && energy.energyCapacity > 0 && (
                            <div className="item-tooltip__energy">
                                <span className="item-tooltip__energy-title">
                                  {energy.energyCapacity} {t("energy")}
                                </span>
                                <div className="item-tooltip__energy-pips">
                                    {Array.from({length: energy.energyCapacity}).map((_, i) => (
                                        <span
                                            key={i}
                                            className={`item-tooltip__energy-pip${
                                                i < energy.energyUsed
                                                    ? " item-tooltip__energy-pip--used"
                                                    : ""
                                            }`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Archétype (arme) : intrinsèque, cadence / impact, et type
                            anti-champion à droite */}
                        {isWeapon && archetypeHash && (
                            <WeaponArchetype
                                itemHash={itemHash}
                                archetypeHash={archetypeHash}
                                breakerType={def.breakerType}
                                rpm={rpm}
                                impact={impact}
                            />
                        )}

                        {/* Perks : toutes les options équipables, en colonnes */}
                        {isWeapon && (
                            <PerkColumns
                                def={def}
                                detail={detail}
                                item={
                                    itemInstanceId
                                        ? {
                                            itemHash,
                                            itemInstanceId,
                                            state,
                                            versionNumber,
                                            gearTier,
                                        }
                                        : undefined
                                }
                                categoryHash={SOCKET_CATEGORY.WEAPON_PERKS}
                            />
                        )}
                        {/* Armure exotique : son attribut intrinsèque, mis en page
                            comme l'armature d'une arme.

                            Il remplace la ligne d'icônes « Attributs de l'armure » :
                            cette catégorie de sockets ne contient rien d'autre que
                            l'archétype — remonté près de la puissance — et trois
                            emplacements de statistiques que le manifeste laisse
                            vides (180 plugs `armor_stats`, aucun avec nom ni icône). */}
                        {isArmor && armorPerks.intrinsicHash && (
                            <ArmorIntrinsic hash={armorPerks.intrinsicHash}/>
                        )}

                        {/* Bonus d'ensemble : au même niveau que les attributs
                            d'armure exotique, donc avant les mods */}
                        {isArmor && <SetBonus def={def}/>}

                        {/* Mods et cosmétiques : plugs équipés */}
                        <PlugRow
                            def={def}
                            detail={detail}
                            categoryHash={SOCKET_CATEGORY.WEAPON_MODS}
                        />
                        <PlugRow
                            def={def}
                            detail={detail}
                            categoryHash={SOCKET_CATEGORY.ARMOR_MODS}
                        />
                        <PlugRow
                            def={def}
                            detail={detail}
                            categoryHash={SOCKET_CATEGORY.ARMOR_COSMETICS}
                        />

                        {/* Attributs équipés sur un artéfact */}
                        <ArtifactPerks def={def} detail={detail}/>

                        {/* Compétences, aspects et fragments d'une doctrine */}
                        {isSubclassItem && <SubclassSockets def={def} detail={detail}/>}
                    </>
                )}

            </div>
        </div>
    );
}
