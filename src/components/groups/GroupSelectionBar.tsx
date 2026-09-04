"use client";

import {useTranslations} from "next-intl";
import type {ProfileData} from "@/lib/bungie/use-profile";
import {EQUIPMENT_BUCKETS} from "@/lib/destiny/buckets";
import {useLoadoutIdentifierChoices} from "@/lib/loadouts/use-loadout-identifiers";
import {useLoadoutGroups} from "@/lib/loadouts/groups/store";
import {useGroupSelection} from "@/lib/loadouts/groups/selection";
import {padLoadouts, setItems} from "@/lib/loadouts/groups/edit";
import {CheckIcon, XMarkIcon} from "@heroicons/react/24/solid";

/**
 * La barre d'une sélection d'équipement en cours.
 *
 * Elle prend la place des onglets de mode d'affichage, et c'est délibéré : la
 * sélection **est** un mode, exclusif des autres. Ses deux boutons sont la seule
 * sortie, ce qui évite de laisser une sélection à moitié faite derrière un
 * changement d'onglet.
 *
 * Elle est montée dans la vue inventaire et non dans l'éditeur du groupe : c'est
 * là que le geste se passe, et l'éditeur est justement masqué le temps qu'il
 * dure.
 */
export function GroupSelectionBar({
                                      data,
                                      slotCount,
                                  }: {
    data: ProfileData;
    /** Emplacements du personnage : la liste du groupe y est normalisée */
    slotCount: number;
}) {
    const t = useTranslations("groups");
    const tCommon = useTranslations("common");

    const groupId = useGroupSelection((s) => s.groupId);
    const groupName = useGroupSelection((s) => s.groupName);
    const slotIndex = useGroupSelection((s) => s.slotIndex);
    const picked = useGroupSelection((s) => s.picked);
    const stop = useGroupSelection((s) => s.stop);

    const group = useLoadoutGroups((s) =>
        s.groups.find((candidate) => candidate.id === groupId),
    );
    const setGroupLoadouts = useLoadoutGroups((s) => s.setGroupLoadouts);
    const choices = useLoadoutIdentifierChoices();

    /**
     * Faux tant que les constantes du manifeste ne sont pas lues. Confirmer
     * alors poserait des identifiants nuls, et `isEmptyLoadout` déclarerait
     * libre un emplacement pourtant rempli — voir `GroupEditor`.
     */
    const ready =
        choices.colors.length > 0 &&
        choices.icons.length > 0 &&
        choices.names.length > 0;

    const confirm = () => {
        if (!group || !ready) return;
        setGroupLoadouts(
            group.id,
            setItems(
                padLoadouts(group.loadouts, slotCount),
                slotIndex,
                picked,
                // Les attributs d'un objet **nouveau venu** ; ceux déjà
                // enregistrés sont conservés par `setItems`.
                (itemInstanceId) => data.items[itemInstanceId]?.sockets ?? [],
                {
                    colorHash: choices.colors[0].hash,
                    iconHash: choices.icons[0].hash,
                    nameHash: choices.names[0].hash,
                },
            ),
        );
        stop();
    };

    return (
        <div className="group-selection">
            <div className="group-selection__label">
                <strong>{t("selecting", {name: groupName})}</strong>
                <span className="group-selection__count">
                    {t("selectedCount", {
                        count: picked.size,
                        total: EQUIPMENT_BUCKETS.size,
                        number: slotIndex + 1,
                    })}
                </span>
            </div>

            <p className="group-selection__hint">{t("selectHint")}</p>

            <div className="group-selection__actions">
                <button
                    type="button"
                    className="btn btn--small btn--primary"
                    disabled={!group || !ready}
                    title={ready ? undefined : t("waitIdentifiers")}
                    onClick={confirm}
                >
                    <CheckIcon/>
                    {tCommon("confirm")}
                </button>
                <button type="button" className="btn btn--small" onClick={stop}>
                    <XMarkIcon/>
                    {tCommon("cancel")}
                </button>
            </div>
        </div>
    );
}
