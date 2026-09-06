"use client";

import {useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
import type {ProfileData} from "@/lib/bungie/use-profile";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {countEquippedSets} from "@/lib/destiny/set-bonus";
import {useLoadoutItems} from "@/lib/destiny/use-loadout-items";
import {useDisplayableItems} from "@/lib/destiny/use-displayable-items";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import {
    useLoadoutIdentifierChoices,
    useLoadoutIdentifiers,
    type LoadoutIdentifiers,
} from "@/lib/loadouts/use-loadout-identifiers";
import {useLoadoutGroups} from "@/lib/loadouts/groups/store";
import {useConfirmEquipGroup} from "@/lib/loadouts/groups/use-confirm-equip";
import {foreignItems, useGroupSelection} from "@/lib/loadouts/groups/selection";
import {SnapshotEditProvider} from "@/lib/loadouts/groups/snapshot-edit";
import {
    moveItem,
    padLoadouts,
    putPlug,
    removeItem,
    setIdentifiers,
    setItems,
    setLoadout,
} from "@/lib/loadouts/groups/edit";
import {
    copyGroupLoadouts,
    emptyGroupLoadout,
    type LoadoutGroup,
} from "@/lib/loadouts/groups/types";
import {EquipmentModeView} from "@/components/equipment/EquipmentModeView";
import {LoadoutSlotTile} from "@/components/loadouts/LoadoutSlotTile";
import {ArrowLeftIcon, BoltIcon, Squares2X2Icon} from "@heroicons/react/24/solid";
import {GroupColorPicker} from "./GroupColorPicker";
import {GroupNameField} from "./GroupNameField";
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

    const setGroupLoadouts = useLoadoutGroups((s) => s.setGroupLoadouts);
    const renameGroup = useLoadoutGroups((s) => s.renameGroup);
    const setGroupColor = useLoadoutGroups((s) => s.setGroupColor);
    const confirmEquip = useConfirmEquipGroup(group.characterId);
    const startSelection = useGroupSelection((s) => s.start);
    const choices = useLoadoutIdentifierChoices();

    const [selected, setSelected] = useState(0);
    /**
     * L'emplacement du personnage retenu comme source, ou `null`.
     *
     * Le clic ne recopie plus rien de lui-même : écraser un emplacement du
     * groupe est destructif, et le geste tombait sous le doigt de quiconque
     * voulait seulement regarder ce que le personnage a enregistré. Il ne fait
     * donc que désigner la source ; c'est un bouton qui engage la copie.
     */
    const [source, setSource] = useState<number | null>(null);

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

    /**
     * L'emplacement du personnage prévisualisé, s'il y en a un.
     *
     * Désigner une source ne sert pas qu'à viser l'écrasement : on ne recopie
     * pas à l'aveugle un emplacement dont les vignettes ne disent ni les
     * attributs ni les cosmétiques. Le clic ouvre donc son contenu là où celui
     * du groupe se lisait, en **lecture seule** — c'est un emplacement du jeu,
     * rien n'y est à modifier ici.
     */
    const previewed = source === null ? undefined : loadouts[source];

    // Le contenu affiché, résolu contre le profil — le même hook que le mode
    // « équipements » pour un emplacement du jeu. Un seul appel pour les deux
    // sources : il indexe tout le profil, le faire deux fois le doublerait.
    const contents = useLoadoutItems(previewed ?? current, data, defs);
    /**
     * Les objets équipés du personnage, armes, armures et doctrine seulement.
     *
     * Ils servent l'emplacement **vide** : la vue les montre alors en aperçu, et
     * le bouton posé par-dessus les y enregistre — le même geste que sur la vue
     * des équipements, où un emplacement libre du jeu n'en propose pas d'autre.
     */
    const equipped = useDisplayableItems(data.equipment[group.characterId] ?? NO_ITEMS);

    // Référence stable pour l'emplacement vide : un tableau neuf relancerait le
    // comptage des bonus d'ensemble à chaque passe.
    const items = contents?.items ?? NO_ITEMS;
    const setCounts = useMemo(
        () => countEquippedSets(contents?.items ?? NO_ITEMS, defs),
        [contents?.items, defs],
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
            // Vide en prévisualisation : c'est ce que `useSnapshotEdit` lit pour
            // savoir qu'un objet est modifiable, et les attributs montrés sont
            // alors ceux d'un emplacement du jeu — les écrire dans le groupe
            // aurait mêlé les deux. Le contexte reste posé pour autant : c'est
            // lui qui retire aux vignettes le double-clic qui équipe.
            sockets: previewed ? EMPTY_SOCKETS : (contents?.sockets ?? EMPTY_SOCKETS),
            onPick: (id: string, socketIndex: number, plugHash: number) =>
                setGroupLoadouts(
                    group.id,
                    putPlug(slots, selected, id, socketIndex, plugHash),
                ),
        }),
        [previewed, contents?.sockets, setGroupLoadouts, group.id, slots, selected],
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

    // L'aperçu de l'équipement porté n'a de sens que sur l'emplacement vide du
    // groupe : en prévisualisation, ce qui est montré vient du personnage.
    const groupEmpty = isEmptyLoadout(current);
    const empty = !previewed && groupEmpty;
    // Un emplacement vide montre l'équipement porté, estompé : c'est l'aperçu
    // de ce que le bouton y enregistrerait. Voir `preview` d'EquipmentModeView.
    const shown = empty ? equipped : items;

    /** Enregistre les objets équipés dans l'emplacement vide sélectionné. */
    const useEquipped = () => {
        if (!ready) return;
        const picked = new Map<number, string>();
        for (const item of equipped) {
            const bucket = bucketOf.get(item.itemInstanceId ?? "");
            if (bucket !== undefined && item.itemInstanceId) {
                picked.set(bucket, item.itemInstanceId);
            }
        }
        write(
            setItems(
                slots,
                selected,
                picked,
                (id) => data.items[id]?.sockets ?? [],
                {
                    colorHash: choices.colors[0].hash,
                    iconHash: choices.icons[0].hash,
                    nameHash: choices.names[0].hash,
                },
            ),
        );
    };

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

                {/* Le liseré s'applique au clic, sans confirmation : il ne
                    touche à rien d'autre que l'apparence de la carte, et le
                    voir changer sous le curseur est le retour attendu. */}
                <GroupColorPicker
                    value={group.color}
                    onChange={(color) => setGroupColor(group.id, color)}
                />

                {/* Le nom se modifie sur place, sans bouton pour l'y autoriser :
                    l'éditeur EST l'écran de modification du groupe, un mode de
                    plus n'y départageait rien. */}
                <GroupNameField
                    key={group.id}
                    name={group.name}
                    label={t("nameLabel")}
                    onRename={(next) => renameGroup(group.id, next)}
                />



                <div className="group-editor__actions">
                    {/* Le même geste que sur la carte du groupe, résumé et
                        confirmé de la même façon : on vient ici pour composer un
                        groupe, et repartir sur la grille pour l'équiper n'avait
                        pas de raison d'être. */}
                    <button
                        type="button"
                        className="btn btn--small btn--primary"
                        onClick={() => confirmEquip(group)}
                    >
                        <BoltIcon/>
                        {tCommon("equip")}
                    </button>
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
                        className="btn btn--small btn--danger"
                        // Rien à recopier si le personnage n'a aucun emplacement
                        disabled={loadouts.length === 0}
                        // Confirmé : le geste emporte les dix emplacements du
                        // groupe d'un coup, et rien ne les rend.
                        onClick={() => {
                            if (
                                window.confirm(
                                    t("overwriteAllConfirm", {
                                        name: group.name,
                                        count: loadouts.length,
                                    }),
                                )
                            ) {
                                write(copyGroupLoadouts(loadouts));
                            }
                        }}
                    >
                        {t("overwriteAll")}
                    </button>
                    <button
                        type="button"
                        className="btn btn--small btn--danger"
                        // Le vidage vise l'emplacement du GROUPE, prévisualisation
                        // ou non : c'est le sien qu'il faut regarder pour savoir
                        // s'il reste quelque chose à vider.
                        disabled={groupEmpty}
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
                            previewed ? (
                                <PreviewTitle
                                    loadout={previewed}
                                    index={source ?? 0}
                                    identifiers={identifiers}
                                    label={t("previewing")}
                                />
                            ) : current ? (
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
                        items={shown}
                        details={data.items}
                        defs={defs}
                        setCounts={setCounts}
                        sockets={contents?.sockets}
                        // Rien n'est équipé : ce qu'on modifie est un
                        // instantané, et c'est `editing` qui en porte les gestes.
                        editable={false}
                        // Absent en prévisualisation : les objets montrés sont
                        // ceux d'un emplacement du jeu, et le retrait aurait
                        // porté sur l'emplacement du groupe, resté hors de vue.
                        onRemoveItem={
                            previewed
                                ? undefined
                                : (id) => write(removeItem(slots, selected, id))
                        }
                        // Un emplacement de groupe vide a légitimement zéro
                        // objet : « Chargement… » y serait un mensonge définitif.
                        quiet
                        // Vide, la vue montre l'équipement porté **estompé** :
                        // le bouton ci-dessous le dévoile au survol, en aperçu
                        // de ce qu'il enregistrerait.
                        preview={empty}
                    />

                    {/* Le seul geste d'un emplacement vide, posé là où le vide a
                        laissé la place — comme `LoadoutCreateButton` sur la vue
                        des équipements. */}
                    {empty && (
                        <div className="loadout-create">
                            <button
                                type="button"
                                className="btn loadout-create__button"
                                disabled={!ready || equipped.length === 0}
                                title={ready ? undefined : t("waitIdentifiers")}
                                onClick={useEquipped}
                            >
                                {t("useEquipped")}
                            </button>
                        </div>
                    )}
                    </SnapshotEditProvider>
                </div>

                <div className="group-editor__slots">
                    <GroupSlotGrid
                        title={t("groupSlots")}
                        loadouts={slots}
                        slotCount={slotCount}
                        identifiers={identifiers}
                        selected={selected}
                        // Revenir au groupe referme la prévisualisation : les
                        // deux grilles se disputent le même panneau, et rien ne
                        // dirait laquelle on regarde si le contenu ne suivait
                        // pas le dernier emplacement touché.
                        onSelect={(index) => {
                            setSelected(index);
                            setSource(null);
                        }}
                        onMove={(from, to) => write(moveItem(slots, from, to))}
                    />

                    {/* Les emplacements du jeu : un clic en ouvre le contenu à
                        gauche, en lecture seule, et le bouton ci-dessous le
                        recopie dans
                        l'emplacement sélectionné du groupe. C'est l'écrasement
                        d'un seul emplacement demandé par le cahier des charges,
                        rendu à un geste délibéré. */}
                    <GroupSlotGrid
                        title={t("characterSlots")}
                        loadouts={loadouts}
                        slotCount={loadouts.length}
                        identifiers={identifiers}
                        selected={source}
                        // Recliquer l'emplacement déjà ouvert le referme, et
                        // rend le panneau à l'emplacement du groupe.
                        onSelect={(index) =>
                            setSource((current) => (current === index ? null : index))
                        }
                        emptyHint={tLoadouts("noSlots")}
                    />
                    {/* Le bouton n'apparaît qu'une fois la source désignée : il
                        écrase, et un bouton d'écrasement posé là en permanence
                        n'aurait rien eu à écraser — désactivé la plupart du
                        temps, il aurait surtout fallu deviner pourquoi. C'est le
                        clic sur un emplacement du personnage qui l'appelle. */}
                    {previewed && (
                        <div className="group-editor__slot-action">
                            <button
                                type="button"
                                className="btn btn--small"
                                onClick={() =>
                                    write(
                                        setLoadout(
                                            slots,
                                            selected,
                                            copyGroupLoadouts([previewed])[0],
                                        ),
                                    )
                                }
                            >
                                {t("overwriteOne", {number: selected + 1})}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Le titre du panneau quand il montre un emplacement du **personnage**.
 *
 * Il dit d'où vient ce qu'on lit — sans quoi rien ne distinguait la
 * prévisualisation du contenu du groupe, les deux occupant le même panneau. Le
 * pendant en lecture seule de `GroupSlotIdentifiers` : ici il n'y a rien à
 * choisir, c'est un emplacement du jeu.
 *
 * Les identifiants sont **reçus** et non lus : ils viennent de l'unique requête
 * groupée de l'éditeur, comme pour les vignettes des deux grilles.
 */
function PreviewTitle({
                          loadout,
                          index,
                          identifiers,
                          label,
                      }: {
    loadout: DestinyLoadout;
    /** Place de l'emplacement chez le personnage, à partir de 0 */
    index: number;
    identifiers: LoadoutIdentifiers;
    label: string;
}) {
    const name = identifiers.names.get(loadout.nameHash);

    return (
        <span className="group-preview-title">
            <span className="group-preview-title__label">{label}</span>
            {/* La vignette des deux grilles, telle quelle : le fond coloré, le
                glyphe par-dessus et le numéro dans l'angle. La recomposer ici
                aurait redit ce que `LoadoutSlotTile` dessine déjà, et laissé les
                deux se désaccorder à la première retouche. Elle n'est pas
                cliquable ici — d'où le `<span>` et non le `<button>` des
                grilles, l'habillage `.loadout-slot` étant commun. */}
            <span className="loadout-slot group-preview-title__slot">
                <LoadoutSlotTile
                    loadout={loadout}
                    index={index}
                    identifiers={identifiers}
                />
            </span>
            {name && <span className="group-preview-title__name">{name}</span>}
        </span>
    );
}

/** Références stables : recréées, elles relanceraient les lectures sans fin. */
const EMPTY_SOCKETS: ReadonlyMap<string, number[]> = new Map();
const NO_ITEMS: DestinyItemComponent[] = [];
