"use client";

import {useTranslations} from "next-intl";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {useSnapshotLoadout} from "@/lib/loadouts/use-snapshot-loadout";
import {useLoadoutActionState} from "@/lib/loadouts/use-loadout-actions";

/**
 * Le seul geste qu'offre un emplacement libre : y enregistrer les objets
 * équipés.
 *
 * Il est posé **au centre de l'équipement** plutôt que dans le panneau de
 * droite, là où l'emplacement libre a laissé le vide. Le survoler fait
 * apparaître les objets qui seraient enregistrés — un aperçu de ce que le clic
 * va produire.
 *
 * Cette révélation est entièrement en CSS (voir `equipment-mode--preview` et le
 * `:has()` de `inventory-view__equipment`) : la passer par un état React
 * re-rendrait les dix lignes et leurs attributs à chaque entrée et sortie du
 * curseur, pour une transition d'opacité.
 */
export function LoadoutCreateButton({
                                        loadout,
                                        characterId,
                                        index,
                                    }: {
    loadout: DestinyLoadout;
    characterId: string;
    /** Place dans la liste, à partir de 0 */
    index: number;
}) {
    const t = useTranslations("loadouts");
    const tActions = useTranslations("actions");
    const {snapshot} = useSnapshotLoadout();
    const {busy, error, failure} = useLoadoutActionState(characterId, index);

    return (
        <div className="loadout-create">
            <button
                type="button"
                className="btn loadout-create__button"
                disabled={busy}
                onClick={() => snapshot(characterId, index, loadout)}
            >
                {t("create")}
            </button>

            {(error || failure) && (
                <p className="loadout-create__error">
                    {failure ? tActions(`failure.${failure}`) : error}
                </p>
            )}
        </div>
    );
}
