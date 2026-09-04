"use client";

import {useMemo, type ReactNode} from "react";
import {useTranslations} from "next-intl";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {ARMOR_COLUMN, WEAPON_COLUMN, type SlotSide} from "@/lib/destiny/buckets";
import {useEquippedPlugs} from "@/lib/destiny/use-equipped-plugs";
import {useShownStats} from "@/lib/destiny/use-shown-stats";
import type {EquippedSetCounts} from "@/lib/destiny/set-bonus";
import type {QueuedItem} from "@/lib/actions/store";
import {MinusIcon} from "@heroicons/react/24/solid";
import {EmptySlotIcon} from "../icons";
import {ItemIcon} from "../ItemIcon";
import {EquipmentPlugs} from "./EquipmentPlugs";
import {CharacterSummary} from "@/components/equipment/CharacterSummary";

/**
 * Mode « équipements » : une ligne par emplacement, ses attributs alignés à
 * côté de la vignette.
 *
 * Les lignes apparient les deux colonnes du mode inventaire — doctrine et
 * casque, arme cinétique et gantelets, etc. — pour que les attributs se
 * déploient vers l'extérieur de chaque côté, comme dans la maquette. La grille
 * a donc quatre colonnes : attributs, vignette, vignette, attributs.
 *
 * Aucun panneau d'inventaire d'emplacement, aucune zone de dépôt : ce mode ne
 * déplace pas d'objets, il montre ce qui est équipé.
 */
export function EquipmentModeView({
                                      title,
                                      items,
                                      details,
                                      defs,
                                      setCounts,
                                      sockets,
                                      characterStats,
                                      editable,
                                      preview = false,
                                      onRemoveItem,
                                      quiet = false,
                                  }: {
    /** Titre de la vue : l'équipement porté, ou l'emplacement sélectionné */
    title: ReactNode;
    /** Les objets à montrer : les équipés, ou ceux d'un équipement sauvegardé */
    items: readonly DestinyItemComponent[];
    details: Record<string, ItemDetail>;
    defs: Map<number, InventoryItemDefinition>;
    /** Bonus d'ensemble des objets **montrés**, pas de ceux qui sont portés */
    setCounts: EquippedSetCounts;
    /**
     * Sockets **enregistrés** dans l'équipement affiché, par itemInstanceId.
     * Absent quand la vue montre l'équipement porté : c'est alors l'état courant
     * des objets qui fait foi.
     */
    sockets?: ReadonlyMap<string, number[]>;
    /**
     * Totaux du composant 200, faisant autorité : Bungie y a déjà additionné
     * armures, mods, fragments et artéfact, bonus conditionnels compris.
     *
     * N'a de sens que si la vue montre l'équipement porté — d'où l'absence
     * lorsqu'un équipement sauvegardé est sélectionné, qui fait retomber
     * l'affichage sur des totaux reconstitués depuis les objets montrés.
     */
    characterStats?: Record<string, number>;
    /**
     * Les attributs s'y changent. Faux pour un équipement sauvegardé : c'est un
     * instantané, rien n'y est équipé en ce moment.
     */
    editable: boolean;
    /**
     * L'emplacement sélectionné est **libre** : la vue montre alors des cases
     * vides, et les objets équipés — ceux qu'un enregistrement y mettrait — ne
     * se dévoilent qu'au survol du bouton de création (voir
     * `LoadoutCreateButton`). Le fondu est en CSS : un état React re-rendrait
     * les dix lignes et leurs attributs à chaque passage du curseur.
     */
    preview?: boolean;
    /**
     * Retirer l'objet d'une ligne — la vue montre alors un emplacement de
     * **groupe** qu'on modifie.
     *
     * C'est le seul geste que l'édition ajoute *ici*. Choisir les objets se
     * fait d'un bloc dans la vue inventaire (`GroupSelectionBar`), et les
     * attributs passent par le contexte `SnapshotEditProvider` — que les
     * rangées comme l'infobulle lisent d'eux-mêmes. `editable` reste faux :
     * rien n'est équipé, aucune action ne part vers Bungie.
     */
    onRemoveItem?: (itemInstanceId: string) => void;
    /**
     * Tait le message de chargement d'une vue sans objet.
     *
     * Un emplacement de groupe **vide** en a légitimement zéro, et « Chargement…»
     * y serait un mensonge qui ne s'effacerait jamais.
     */
    quiet?: boolean;
}) {
    const t = useTranslations("inventory");
    const plugs = useEquippedPlugs(items, details, defs, setCounts, sockets);

    // Le résumé décrit ce que la vue **montre**, et non ce que le personnage
    // porte : sélectionner un équipement sauvegardé doit en donner les
    // statistiques et les bonus d'ensemble, pas ceux de la panoplie actuelle.
    const computedStats = useShownStats(items, details);
    const stats = characterStats ?? computedStats;

    // Un emplacement ne porte qu'un objet équipé : un simple index suffit.
    const byBucket = useMemo(() => {
        const map = new Map<number, DestinyItemComponent>();
        for (const item of items) {
            if (!map.has(item.bucketHash)) map.set(item.bucketHash, item);
        }
        return map;
    }, [items]);

    // Les deux colonnes ont la même longueur (cinq emplacements chacune) ;
    // `Math.max` évite d'en perdre une ligne si Bungie en ajoutait un.
    const rowCount = Math.max(WEAPON_COLUMN.length, ARMOR_COLUMN.length);

    return (
        <section
            className={`equipment-mode${preview ? " equipment-mode--preview" : ""}`}
        >
            <div className="equipment-mode__title">{title}</div>

            <div className="equipment-mode__rows">
                {Array.from({length: rowCount}).map((_, row) => (
                    <div key={row} className="equipment-mode__row">
                        <EquipmentSide
                            bucketHash={WEAPON_COLUMN[row]}
                            item={byBucket.get(WEAPON_COLUMN[row])}
                            details={details}
                            defs={defs}
                            plugs={plugs}
                            side="left"
                            editable={editable}
                            preview={preview}
                            onRemoveItem={onRemoveItem}
                        />
                        <EquipmentSide
                            bucketHash={ARMOR_COLUMN[row]}
                            item={byBucket.get(ARMOR_COLUMN[row])}
                            details={details}
                            defs={defs}
                            plugs={plugs}
                            side="right"
                            editable={editable}
                            preview={preview}
                            onRemoveItem={onRemoveItem}
                        />
                    </div>
                ))}
            </div>

            <CharacterSummary stats={stats} setCounts={setCounts}/>

            {items.length === 0 && !quiet && (
                <p className="equipment-mode__message">{t("loading")}</p>
            )}
        </section>
    );
}

/** Une moitié de ligne : la vignette et ses attributs, du bon côté. */
function EquipmentSide({
                           bucketHash,
                           item,
                           details,
                           defs,
                           plugs,
                           side,
                           editable,
                           preview,
                           onRemoveItem,
                       }: {
    bucketHash: number | undefined;
    item: DestinyItemComponent | undefined;
    details: Record<string, ItemDetail>;
    defs: Map<number, InventoryItemDefinition>;
    plugs: ReturnType<typeof useEquippedPlugs>;
    side: SlotSide;
    editable: boolean;
    /**
     * L'emplacement sélectionné est **libre** : la vue montre alors des cases
     * vides, et les objets équipés — ceux qu'un enregistrement y mettrait — ne
     * se dévoilent qu'au survol du bouton de création (voir
     * `LoadoutCreateButton`). Le fondu est en CSS : un état React re-rendrait
     * les dix lignes et leurs attributs à chaque passage du curseur.
     */
    preview?: boolean;
    /** Voir la vue : la ligne devient modifiable */
    onRemoveItem?: (itemInstanceId: string) => void;
}) {
    const t = useTranslations("groups");
    if (bucketHash === undefined) return null;

    const detail = item?.itemInstanceId ? details[item.itemInstanceId] : undefined;
    const rows = plugs.get(bucketHash) ?? [];

    // L'objet tel qu'il part en file d'actions. Les habillages en font partie :
    // la carte du panneau est montée hors de la grille et ne peut pas les
    // retrouver seule.
    const queued: QueuedItem | undefined =
        (editable || onRemoveItem) && item?.itemInstanceId
            ? {
                itemHash: item.itemHash,
                itemInstanceId: item.itemInstanceId,
                state: item.state,
                versionNumber: item.versionNumber,
                gearTier: detail?.instance?.gearTier,
            }
            : undefined;

    const instanceId = item?.itemInstanceId;

    const plugsNode = (
        <EquipmentPlugs
            rows={rows}
            side={side}
            item={queued}
            def={item ? defs.get(item.itemHash) : undefined}
            detail={detail}
        />
    );

    const emptyCell = (
        <span className="slot-cell slot-cell--empty" aria-hidden>
            <EmptySlotIcon/>
        </span>
    );

    // La vignette reste au centre dans les deux cas : c'est l'ordre des deux
    // enfants que le côté inverse, pas leur alignement.
    const thumb = (
        <div className="equipment-mode__item">
            {/* En aperçu, la case vide est posée SOUS la vignette : c'est elle
                qu'on voit tant que le bouton de création n'est pas survolé. */}
            {preview && (
                <span className="equipment-mode__placeholder">{emptyCell}</span>
            )}
            {item ? (
                <ItemIcon
                    itemHash={item.itemHash}
                    itemInstanceId={item.itemInstanceId}
                    state={item.state}
                    versionNumber={item.versionNumber}
                    gearTier={detail?.instance?.gearTier}
                    equipped
                />
            ) : (
                emptyCell
            )}

            {/* Le retrait est un « − » posé dans le coin, et non un calque
                couvrant la vignette : celui-ci captait le clic dès le survol,
                et c'est la vignette qu'on veut pouvoir cliquer — son infobulle
                est le seul endroit où se changent les cosmétiques. */}
            {onRemoveItem && instanceId && (
                <button
                    type="button"
                    className="equipment-mode__remove"
                    aria-label={t("removeItem")}
                    title={t("removeItem")}
                    onClick={() => onRemoveItem(instanceId)}
                >
                    <MinusIcon/>
                </button>
            )}
        </div>
    );

    return (
        <div className={`equipment-mode__side equipment-mode__side--${side}`}>
            {side === "left" ? (
                <>
                    {plugsNode}
                    {thumb}
                </>
            ) : (
                <>
                    {thumb}
                    {plugsNode}
                </>
            )}
        </div>
    );
}
