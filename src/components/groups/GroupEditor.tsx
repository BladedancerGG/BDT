"use client";

import {useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
import type {ProfileData} from "@/lib/bungie/use-profile";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {countEquippedSets} from "@/lib/destiny/set-bonus";
import {useLoadoutItems} from "@/lib/destiny/use-loadout-items";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import {
    useLoadoutIdentifierChoices,
    useLoadoutIdentifiers,
} from "@/lib/loadouts/use-loadout-identifiers";
import {useLoadoutGroups} from "@/lib/loadouts/groups/store";
import {foreignItems, useGroupSelection} from "@/lib/loadouts/groups/selection";
import {SnapshotEditProvider} from "@/lib/loadouts/groups/snapshot-edit";
import {
    moveItem,
    padLoadouts,
    putPlug,
    removeItem,
    setIdentifiers,
    setLoadout,
} from "@/lib/loadouts/groups/edit";
import {
    copyGroupLoadouts,
    emptyGroupLoadout,
    GROUP_NAME_MAX,
    type LoadoutGroup,
} from "@/lib/loadouts/groups/types";
import {EquipmentModeView} from "@/components/equipment/EquipmentModeView";
import {ArrowLeftIcon, Squares2X2Icon} from "@heroicons/react/24/solid";
import {GroupColorPicker} from "./GroupColorPicker";
import {GroupSlotIdentifiers} from "./GroupSlotIdentifiers";
import {GroupSlotGrid} from "./GroupSlotGrid";

/**
 * L'éditeur d'un groupe : les emplacements à droite, le contenu du sélectionné
 * à gauche.
 *
 * C'est la disposition du mode « équipements », et volontairement : les dix
 * lignes d'objets avec leurs attributs sont le seul endroit où modifier un
 * instantané objet par objet se lit, et `EquipmentModeView` sait déjà les
 * dessiner. Il reçoit ici un troisième régime — voir `SnapshotEditing` : les
 * vignettes ouvrent un sélecteur d'objet, les attributs s'écrivent dans
 * l'instantané, et rien ne part vers Bungie.
 *
 * **Toute écriture passe par `edit.ts`**, module pur, puis par une unique
 * action du store. L'éditeur ne fait que fournir ce que le module ne peut pas
 * deviner : où s'équipe un objet, et les identifiants par défaut du jeu.
 */
export function GroupEditor({
                                group,
                                data,
                                defs,
                                loadouts,
                                classType,
                                slotCount,
                                onClose,
                            }: {
    group: LoadoutGroup;
    data: ProfileData;
    defs: Map<number, InventoryItemDefinition>;
    /** Les emplacements du personnage, source des écrasements */
    loadouts: readonly DestinyLoadout[];
    classType: number | undefined;
    slotCount: number;
    onClose: () => void;
}) {
    const t = useTranslations("groups");
    const tCommon = useTranslations("common");
    const tLoadouts = useTranslations("loadouts");
    const tInventory = useTranslations("inventory");

    const setGroupLoadouts = useLoadoutGroups((s) => s.setGroupLoadouts);
    const renameGroup = useLoadoutGroups((s) => s.renameGroup);
    const setGroupColor = useLoadoutGroups((s) => s.setGroupColor);
    const startSelection = useGroupSelection((s) => s.start);
    const choices = useLoadoutIdentifierChoices();

    const [selected, setSelected] = useState(0);
    const [name, setName] = useState<string | null>(null);

    // La liste normalisée à la taille du personnage. Toutes les écritures
    // partent de là : un groupe créé quand le compte possédait moins
    // d'emplacements a une liste plus courte, et écrire au-delà la trouerait.
    const slots = useMemo(
        () => padLoadouts(group.loadouts, slotCount),
        [group.loadouts, slotCount],
    );
    const current = slots[selected];

    /**
     * Où s'équipe un objet, par identifiant d'instance.
     *
     * Sert à amorcer la sélection depuis ce que l'emplacement contient déjà :
     * elle est indexée par emplacement d'équipement, l'instantané par instance.
     * Le `bucketHash` du composant ne conviendrait pas — un objet au coffre
     * porte celui du coffre, pas celui où il s'équipe.
     */
    const bucketOf = useMemo(() => {
        const byInstance = new Map<string, number>();
        for (const item of [
            ...Object.values(data.equipment),
            ...Object.values(data.inventory),
            data.vault,
        ].flat()) {
            const bucket = defs.get(item.itemHash)?.inventory?.bucketTypeHash;
            if (item.itemInstanceId && bucket !== undefined) {
                byInstance.set(item.itemInstanceId, bucket);
            }
        }
        return byInstance;
    }, [data, defs]);

    /**
     * Les trois listes de constantes du manifeste sont lues.
     *
     * Elles portent les identifiants par défaut qu'un emplacement encore vierge
     * reçoit en même temps que ses premiers objets. Sans eux, `isEmptyLoadout`
     * continuerait de le déclarer libre — et il ne resterait pas seulement sans
     * vignette : `useLoadoutItems` refuserait d'en résoudre le contenu, et les
     * objets qu'on vient de choisir seraient tout bonnement invisibles. Le geste
     * est donc retenu, comme `useSnapshotLoadout` retient l'enregistrement.
     * L'attente est brève — le manifeste est déjà garanti par `Dashboard`, il ne
     * manque qu'une lecture Dexie.
     */
    const ready =
        choices.colors.length > 0 &&
        choices.icons.length > 0 &&
        choices.names.length > 0;

    const write = (next: ReturnType<typeof padLoadouts>) =>
        setGroupLoadouts(group.id, next);

    // Le contenu de l'emplacement sélectionné, résolu contre le profil — le même
    // hook que le mode « équipements » pour un emplacement du jeu.
    const contents = useLoadoutItems(current, data, defs);
    // Référence stable pour l'emplacement vide : un tableau neuf relancerait le
    // comptage des bonus d'ensemble à chaque passe.
    const items = contents?.items ?? NO_ITEMS;
    const setCounts = useMemo(
        () => countEquippedSets(items, defs),
        [items, defs],
    );

    /**
     * Ce que le contexte d'édition d'attributs expose.
     *
     * Mémoïsée : `useSnapshotEdit` la prend en dépendance d'un `useMemo`, et une
     * valeur recréée à chaque passe y relancerait le calcul — et avec lui le
     * rendu de toutes les rangées d'attributs et de l'infobulle ouverte.
     */
    const snapshotEdit = useMemo(
        () => ({
            sockets: contents?.sockets ?? EMPTY_SOCKETS,
            onPick: (id: string, socketIndex: number, plugHash: number) =>
                setGroupLoadouts(
                    group.id,
                    putPlug(slots, selected, id, socketIndex, plugHash),
                ),
        }),
        [contents?.sockets, setGroupLoadouts, group.id, slots, selected],
    );

    // Une seule requête groupée pour toutes les vignettes des deux grilles.
    const allLoadouts = useMemo(() => [...slots, ...loadouts], [slots, loadouts]);
    const identifiers = useLoadoutIdentifiers(allLoadouts);

    /**
     * Passe en sélection d'équipement, amorcée par ce que l'emplacement porte.
     *
     * L'amorçage n'est pas un détail : la sélection **remplace** le contenu de
     * l'emplacement à la confirmation. Partir d'une grille vide aurait fait de
     * chaque retouche une ressaisie des dix objets.
     */
    const startPicking = () => {
        const picked = new Map<number, string>();
        for (const entry of current?.items ?? []) {
            const bucket = bucketOf.get(entry.itemInstanceId);
            if (bucket !== undefined) picked.set(bucket, entry.itemInstanceId);
        }
        startSelection({
            groupId: group.id,
            groupName: group.name,
            slotIndex: selected,
            classType,
            picked,
            // Les objets liés à un autre personnage : artéfacts et doctrines,
            // qui ne se transfèrent pas. Calculé ici, où le profil est sous la
            // main — `ItemIcon` ne sait pas qui détient ce qu'il montre.
            foreign: foreignItems(
                [
                    ...Object.entries(data.equipment),
                    ...Object.entries(data.inventory),
                ].map(([id, items]) => ({characterId: id, items})),
                group.characterId,
                defs,
            ),
        });
    };

    const empty = isEmptyLoadout(current);

    return (
        <div className="group-editor">
            <div className="group-editor__toolbar">
                <button
                    type="button"
                    className="btn btn--small"
                    onClick={onClose}
                >
                    <ArrowLeftIcon/>
                    {t("back")}
                </button>

                {/* Le nom se modifie sur place : un champ qui ne s'ouvre qu'au
                    besoin, plutôt qu'une modale de plus pour une seule ligne. */}
                {name === null ? (
                    <>
                        <h2 className="group-editor__name">{group.name}</h2>
                        <button
                            type="button"
                            className="btn btn--small"
                            onClick={() => setName(group.name)}
                        >
                            {tCommon("edit")}
                        </button>
                    </>
                ) : (
                    <form
                        className="group-editor__rename"
                        onSubmit={(event) => {
                            event.preventDefault();
                            renameGroup(group.id, name);
                            setName(null);
                        }}
                    >
                        <input
                            className="group-name__input"
                            value={name}
                            maxLength={GROUP_NAME_MAX}
                            aria-label={t("nameLabel")}
                            autoFocus
                            onChange={(event) => setName(event.target.value)}
                        />
                        <button type="submit" className="btn btn--small btn--primary">
                            {tCommon("confirm")}
                        </button>
                        <button
                            type="button"
                            className="btn btn--small"
                            onClick={() => setName(null)}
                        >
                            {tCommon("cancel")}
                        </button>
                    </form>
                )}

                {/* Le liseré s'applique au clic, sans confirmation : il ne
                    touche à rien d'autre que l'apparence de la carte, et le
                    voir changer sous le curseur est le retour attendu. */}
                <GroupColorPicker
                    value={group.color}
                    onChange={(color) => setGroupColor(group.id, color)}
                />

                <div className="group-editor__actions">
                    <button
                        type="button"
                        className="btn btn--small btn--primary"
                        // Sans emplacement à remplir, rien à sélectionner
                        disabled={!ready || slotCount === 0}
                        title={ready ? undefined : t("waitIdentifiers")}
                        onClick={startPicking}
                    >
                        <Squares2X2Icon/>
                        {t("pickItems")}
                    </button>
                    <button
                        type="button"
                        className="btn btn--small"
                        // Rien à recopier si le personnage n'a aucun emplacement
                        disabled={loadouts.length === 0}
                        onClick={() => write(copyGroupLoadouts(loadouts))}
                    >
                        {t("overwriteAll")}
                    </button>
                    <button
                        type="button"
                        className="btn btn--small btn--danger"
                        disabled={empty}
                        onClick={() =>
                            write(setLoadout(slots, selected, emptyGroupLoadout()))
                        }
                    >
                        {t("clearSlot", {number: selected + 1})}
                    </button>
                </div>
            </div>

            <div className="group-editor__body">
                {/* Les dix lignes de l'emplacement sélectionné, modifiables */}
                <div className="group-editor__contents">
                    {/* Les rangées d'attributs comme les infobulles y puisent :
                        un clic sur un attribut ou un cosmétique est écrit dans
                        l'instantané, pas envoyé à Bungie. */}
                    <SnapshotEditProvider value={snapshotEdit}>
                    <EquipmentModeView
                        // L'apparence de l'emplacement tient lieu de titre, et
                        // s'y modifie : un emplacement rempli à la main gardait
                        // sinon les premiers choix du jeu, et tous se
                        // ressemblaient.
                        title={
                            current ? (
                                <GroupSlotIdentifiers
                                    identifiers={current}
                                    slotNumber={selected + 1}
                                    onChange={(next) =>
                                        write(setIdentifiers(slots, selected, next))
                                    }
                                />
                            ) : (
                                t("slotTitle", {number: selected + 1})
                            )
                        }
                        items={items}
                        details={data.items}
                        defs={defs}
                        setCounts={setCounts}
                        sockets={contents?.sockets}
                        // Rien n'est équipé : ce qu'on modifie est un
                        // instantané, et c'est `editing` qui en porte les gestes.
                        editable={false}
                        onRemoveItem={(id) => write(removeItem(slots, selected, id))}
                        // Un emplacement de groupe vide a légitimement zéro
                        // objet : « Chargement… » y serait un mensonge définitif.
                        quiet
                    />
                    </SnapshotEditProvider>
                </div>

                <div className="group-editor__slots">
                    <GroupSlotGrid
                        title={t("groupSlots")}
                        loadouts={slots}
                        slotCount={slotCount}
                        identifiers={identifiers}
                        selected={selected}
                        onSelect={setSelected}
                        onMove={(from, to) => write(moveItem(slots, from, to))}
                    />

                    {/* Les emplacements du jeu : un clic recopie celui-là dans
                        l'emplacement sélectionné du groupe. C'est l'écrasement
                        d'un seul emplacement demandé par le cahier des charges. */}
                    <GroupSlotGrid
                        title={t("characterSlots")}
                        loadouts={loadouts}
                        slotCount={loadouts.length}
                        identifiers={identifiers}
                        onSelect={(index) => {
                            const source = loadouts[index];
                            if (!source) return;
                            write(
                                setLoadout(
                                    slots,
                                    selected,
                                    copyGroupLoadouts([source])[0],
                                ),
                            );
                        }}
                        emptyHint={tLoadouts("noSlots")}
                    />
                    <p className="group-editor__hint">
                        {t("overwriteOneHint", {number: selected + 1})}
                    </p>
                    {!ready && (
                        <p className="group-editor__hint group-editor__hint--wait">
                            {t("waitIdentifiers")}
                        </p>
                    )}
                    {items.length === 0 && !empty && (
                        <p className="group-editor__hint">{tInventory("loading")}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Références stables : recréées, elles relanceraient les lectures sans fin. */
const EMPTY_SOCKETS: ReadonlyMap<string, number[]> = new Map();
const NO_ITEMS: DestinyItemComponent[] = [];
