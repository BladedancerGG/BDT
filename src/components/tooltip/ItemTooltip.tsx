"use client";

import {useMemo, useState, type CSSProperties} from "react";
import {useTranslations} from "next-intl";
import {
    useFloating,
    offset,
    flip,
    shift,
    size,
    autoUpdate,
    FloatingPortal,
} from "@floating-ui/react";
import {useDefinition} from "@/lib/manifest/use-definition";
import {useItemData} from "@/lib/bungie/use-item-data";
import {
    useSocketColumns,
    useSocketOptions,
    useTrackerPlugs,
} from "@/lib/destiny/use-sockets";
import {
    usePlugAvailability,
    type PlugAvailability,
} from "@/lib/destiny/use-plug-availability";
import type {
    InventoryItemDefinition,
    SocketCategoryDefinition,
} from "@/lib/destiny/types";
import type {ItemDetail} from "@/lib/bungie/item";
import {
    tierColor,
    damageColor,
    BUCKET,
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
    ARTIFACT_RESET_CATEGORY,
    ARTIFACT_SOCKET_CATEGORIES,
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
import {
    PlugButton,
    PlugSlot,
    SocketPicker,
    SocketPickerProvider,
    type PickerTarget,
} from "./SocketPicker";

// Rangées d'emplacements de l'infobulle. Les constantes vivent hors du rendu :
// elles servent de dépendance à un `useMemo`, un tableau recréé à chaque rendu
// le relancerait sans fin.
//
// Une arme n'a qu'une rangée : mods et cosmétiques (revêtement, ornement, effet
// de frag) y tiennent côte à côte, comme en jeu. Une armure garde les siennes
// séparées — ses quatre mods et ses deux cosmétiques ne tiendraient pas sur une
// seule ligne.
const WEAPON_SOCKET_ROW = [
    SOCKET_CATEGORY.WEAPON_MODS,
    SOCKET_CATEGORY.WEAPON_COSMETICS,
] as const;
const ARMOR_MOD_ROW = [SOCKET_CATEGORY.ARMOR_MODS] as const;
const ARMOR_COSMETIC_ROW = [SOCKET_CATEGORY.ARMOR_COSMETICS] as const;

/**
 * Attributs d'un artéfact.
 *
 * Leurs catégories de sockets n'ont aucun nom dans le manifeste : on regroupe
 * donc tout sous un libellé traduit. Les emplacements vides sont conservés,
 * contrairement à avant : ce sont eux qu'on vient remplir.
 *
 * La réinitialisation — qui déséquipe d'un coup tous les attributs — vit dans
 * un socket à part, sur sa propre ligne (voir ARTIFACT_RESET_CATEGORY).
 */
function ArtifactPerks({
                           def,
                           detail,
                           available,
                       }: {
    def: InventoryItemDefinition;
    detail: ItemDetail | undefined;
    available: PlugAvailability;
}) {
    const t = useTranslations("item");
    // Les quatre catégories sont des rangées du même bloc : leurs index de
    // sockets sont concaténés dans l'ordre du jeu.
    const indexes = useMemo(
        () =>
            ARTIFACT_SOCKET_CATEGORIES.flatMap(
                (categoryHash) =>
                    def.sockets?.socketCategories?.find(
                        (c) => c.socketCategoryHash === categoryHash,
                    )?.socketIndexes ?? [],
            ),
        [def],
    );
    const columns = useSocketOptions(def, detail, indexes, available);
    const reset = useSocketColumns(
        def,
        detail,
        ARTIFACT_RESET_CATEGORY,
        available,
    );

    if (columns.length === 0) return null;

    return (
        <>
            <div className="socket-section">
                <div className="socket-section__row">
                    {columns.map((column) => (
                        <PlugSlot
                            key={column.socketIndex}
                            column={column}
                            label={t("artifactPerks")}
                        />
                    ))}
                </div>
            </div>

            {reset.map((column) => {
                // Le socket porte deux plugs : l'emplacement vide (en place) et
                // la remise à zéro. C'est celle-ci qu'on affiche, cliquable.
                const resetHash = column.options.find(
                    (hash) => hash !== column.equippedHash,
                );
                if (!resetHash) return null;
                return (
                    <div key={column.socketIndex} className="socket-section">
                        <div className="socket-section__row">
                            <PlugButton
                                socketIndex={column.socketIndex}
                                hash={resetHash}
                            />
                        </div>
                    </div>
                );
            })}
        </>
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
    const {pending, error, failure} = usePlugActionState(item?.itemInstanceId);
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
                    // Rien n'est figé pendant l'attente : les colonnes restent
                    // cliquables et les choix s'empilent dans la file, qui les
                    // envoie l'un après l'autre — Bungie limite le débit des
                    // écritures sur un même compte, pas les clics.
                    const changeable =
                        Boolean(item) &&
                        column.options.length > 1 &&
                        !disabled.has(column.socketIndex);

                    // L'attribut en file prime sur celui rendu par l'API : il
                    // sert d'« équipé » à l'affichage comme à la comparaison,
                    // sans quoi un second clic dans la même colonne reproposerait
                    // ce qui vient d'être demandé.
                    const equippedHash =
                        pending.get(column.socketIndex) ?? column.equippedHash;

                    return (
                        <div key={column.socketIndex} className="socket-column">
                            {column.options.map((hash) => (
                                <PlugIcon
                                    key={hash}
                                    hash={hash}
                                    state={hash === equippedHash ? "equipped" : "available"}
                                    // Seules ces colonnes contiennent des attributs
                                    // améliorés ; ailleurs le marquage n'a pas de sens.
                                    markEnhanced
                                    onEquip={
                                        item && changeable && hash !== equippedHash
                                            ? () => insert(item, column.socketIndex, hash)
                                            : undefined
                                    }
                                    busy={pending.get(column.socketIndex) === hash}
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

/**
 * Sockets affichés en simple ligne (mods, cosmétiques) : le plug équipé de
 * chacun, cliquable pour ouvrir le sélecteur de son socket.
 *
 * Plusieurs catégories peuvent partager la rangée — sur une arme, les mods et
 * les cosmétiques (revêtement, ornement, effet de frag) tiennent sur la même,
 * comme en jeu. Le regroupement se fait sur les index de sockets, donc sans
 * ajouter de lecture : le nombre de hooks ne dépend pas du nombre de
 * catégories.
 */
function PlugRow({
                     def,
                     detail,
                     available,
                     categoryHashes,
                     square = true,
                 }: {
    def: InventoryItemDefinition;
    detail: ItemDetail | undefined;
    available: PlugAvailability;
    categoryHashes: readonly number[];
    square?: boolean;
}) {
    const indexes = useMemo(
        () =>
            categoryHashes.flatMap(
                (categoryHash) =>
                    def.sockets?.socketCategories?.find(
                        (c) => c.socketCategoryHash === categoryHash,
                    )?.socketIndexes ?? [],
            ),
        [def, categoryHashes],
    );
    const columns = useSocketOptions(def, detail, indexes, available);
    // Nom de repli quand le plug équipé n'a pas de type affichable : celui de
    // la première catégorie, la plus représentative de la rangée.
    const title = useCategoryName(categoryHashes[0]);

    // Même écart que dans les colonnes d'attributs : certaines armes portent
    // leur compteur dans une catégorie affichée en rangée.
    const trackers = useTrackerPlugs(
        columns.map((c) => c.equippedHash).filter(Boolean) as number[],
    );
    const equipped = columns.filter(
        (c) => c.equippedHash && !trackers.has(c.equippedHash),
    );

    if (equipped.length === 0) return null;

    return (
        <div className="socket-section">
            {/*<span className="socket-section__title">{title}</span>*/}
            <div className="socket-section__row">
                {equipped.map((column) => (
                    <PlugSlot
                        key={column.socketIndex}
                        column={column}
                        square={square}
                        label={title}
                    />
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
    // Mods, revêtements, ornements, aspects… débloqués sur le compte : sans
    // eux, aucun moyen de savoir ce qui est équipable dans un emplacement.
    const available = usePlugAvailability(itemInstanceId);

    // L'objet tel qu'il part en file d'actions. Les habillages en font partie :
    // la carte du panneau est montée hors de la grille et ne peut pas les
    // retrouver seule.
    const queued: QueuedItem | undefined = useMemo(
        () =>
            itemInstanceId
                ? {itemHash, itemInstanceId, state, versionNumber, gearTier}
                : undefined,
        [itemHash, itemInstanceId, state, versionNumber, gearTier],
    );

    // Socket dont le sélecteur est ouvert. Il vit ici et non dans chaque
    // rangée : un seul panneau à la fois, et c'est l'infobulle entière qui lui
    // sert d'ancre.
    const [picker, setPicker] = useState<PickerTarget | undefined>();
    const {pending, error, failure} = usePlugActionState(itemInstanceId);

    // Le panneau s'ancre à l'infobulle, pas à l'icône cliquée : il la longe sur
    // toute sa hauteur, comme dans la maquette. `size` la lui impose comme
    // plafond — au-delà, il défile.
    const {refs, floatingStyles} = useFloating({
        open: Boolean(picker),
        placement: "right-end",
        middleware: [
            offset(8),
            flip({fallbackPlacements: ["left-end"]}),
            shift({padding: 8}),
            size({
                padding: 8,
                apply({availableHeight, rects, elements}) {
                    // Une variable CSS, pas un `max-height` sur le calque : le
                    // calque n'a pas de débordement à lui, c'est le panneau
                    // qu'il contient qui doit être borné — sinon rien ne le
                    // retient et sa grille ne défile pas.
                    elements.floating.style.setProperty(
                        "--picker-max-height",
                        `${Math.min(availableHeight, rects.reference.height)}px`,
                    );
                },
            }),
        ],
        whileElementsMounted: autoUpdate,
    });

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

    // Un artéfact n'est identifiable que par son emplacement : son `itemType`
    // vaut 0 (voir CLAUDE.md). Ni lui ni une doctrine n'ont de puissance à
    // afficher — la valeur que renvoie l'API n'a pas de sens pour eux.
    const isArtifact = def.inventory?.bucketTypeHash === BUCKET.Artifact;
    const showPower = !isSubclassItem && !isArtifact;

    // Le sélecteur garde son socket, pas l'état du socket : après une
    // insertion réussie, le plug en place a changé et il doit le refléter.
    const target: PickerTarget | undefined = picker && {
        ...picker,
        equippedHash: detail?.sockets?.[picker.socketIndex] || picker.equippedHash,
    };

    return (
        <SocketPickerProvider
            value={{
                item: queued,
                target,
                toggle: (next) =>
                    setPicker((current) =>
                        current?.socketIndex === next.socketIndex ? undefined : next,
                    ),
                disabled: new Set(detail?.disabledSockets ?? []),
                pending,
            }}
        >
        <div
            // setReference est un callback ref stable de Floating UI
            ref={refs.setReference}
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
                        {!isWeapon &&
                            ((showPower && power != null) || armorPerks.archetypeHash) && (
                            <div className="item-tooltip__power">
                                {showPower && power != null && (
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
                                item={queued}
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

                        {/* Mods et cosmétiques : plug équipé de chaque socket,
                            cliquable pour choisir ce qu'on y met. Les
                            cosmétiques d'arme (revêtement, ornement, effet de
                            frag) ont leur propre catégorie, distincte de celle
                            des armures. */}
                        <PlugRow
                            def={def}
                            detail={detail}
                            available={available}
                            categoryHashes={WEAPON_SOCKET_ROW}
                        />
                        <PlugRow
                            def={def}
                            detail={detail}
                            available={available}
                            categoryHashes={ARMOR_MOD_ROW}
                        />
                        <PlugRow
                            def={def}
                            detail={detail}
                            available={available}
                            categoryHashes={ARMOR_COSMETIC_ROW}
                        />

                        {/* Attributs équipés sur un artéfact, et sa remise à zéro */}
                        {isArtifact && (
                            <ArtifactPerks
                                def={def}
                                detail={detail}
                                available={available}
                            />
                        )}

                        {/* Compétences, aspects et fragments d'une doctrine */}
                        {isSubclassItem && (
                            <SubclassSockets
                                def={def}
                                detail={detail}
                                available={available}
                            />
                        )}
                    </>
                )}

            </div>
        </div>

            {/* Deuxième infobulle : les options du socket cliqué. Dans un
                portail, comme l'infobulle d'objet — elle ne doit pas être
                rognée par elle. */}
            {target && (
                <FloatingPortal>
                    <div
                        // setFloating est un callback ref stable de Floating UI
                        // eslint-disable-next-line react-hooks/refs
                        ref={refs.setFloating}
                        style={floatingStyles}
                        className="floating-layer floating-layer--picker"
                    >
                        <SocketPicker target={target} error={error} failure={failure}/>
                    </div>
                </FloatingPortal>
            )}
        </SocketPickerProvider>
    );
}
