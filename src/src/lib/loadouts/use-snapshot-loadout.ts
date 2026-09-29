"use client";

import {useCallback} from "react";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {isRealHash} from "./loadout";
import {useLoadoutActions} from "./use-loadout-actions";
import {useLoadoutIdentifierChoices} from "./use-loadout-identifiers";

/**
 * Enregistrer les objets équipés dans un emplacement — créer ou écraser.
 *
 * Un hook à part, et non le corps du bouton qui l'appelle : deux boutons le
 * demandent désormais, celui du panneau pour un écrasement et celui posé au
 * centre de l'équipement pour une création. Les identifiants à fournir sont la
 * partie qui ne se devine pas, autant ne l'écrire qu'une fois.
 *
 * `SnapshotLoadout` **exige les trois**, contrairement à ce que laisse croire
 * leur `nullable` dans le schéma OpenAPI : omis, l'appel repart en
 * `DestinyInvalidRequest` (1622). Et ceux d'un emplacement libre ne conviennent
 * pas davantage — ils valent la sentinelle `INVALID_HASH`, que Bungie refuse
 * tout autant. Il faut donc en fournir de vrais : ceux en place quand il y en a,
 * et sinon le premier choix de chaque liste du jeu, seul ordre qui ait un sens
 * ici. Le titre permet ensuite de les changer.
 */
export function useSnapshotLoadout() {
    const choices = useLoadoutIdentifierChoices();
    const {run} = useLoadoutActions();

    const defaults = {
        colorHash: choices.colors[0]?.hash,
        iconHash: choices.icons[0]?.hash,
        nameHash: choices.names[0]?.hash,
    };

    /**
     * Faux tant que les constantes du manifeste ne sont pas lues : un
     * emplacement libre n'aurait alors aucun identifiant valide à recevoir.
     */
    const ready =
        defaults.colorHash !== undefined &&
        defaults.iconHash !== undefined &&
        defaults.nameHash !== undefined;

    const snapshot = useCallback(
        (
            characterId: string,
            loadoutIndex: number,
            /** L'emplacement visé, pour conserver son apparence s'il en a une */
            loadout: DestinyLoadout | undefined,
        ) => {
            /** Un identifiant ne part que s'il en est un — voir INVALID_HASH. */
            const keep = (hash: number | undefined, fallback: number | undefined) =>
                isRealHash(hash) ? hash : fallback;

            return run(
                {
                    kind: "snapshot",
                    characterId,
                    loadoutIndex,
                    colorHash: keep(loadout?.colorHash, defaults.colorHash),
                    iconHash: keep(loadout?.iconHash, defaults.iconHash),
                    nameHash: keep(loadout?.nameHash, defaults.nameHash),
                },
                {
                    // Recopiés dans l'action : la carte du panneau redessine la
                    // vignette de l'emplacement.
                    colorHash: loadout?.colorHash ?? 0,
                    iconHash: loadout?.iconHash ?? 0,
                    nameHash: loadout?.nameHash ?? 0,
                    // Sans identifiants à donner, l'appel partirait pour être
                    // refusé : l'action entre en file en le disant.
                    failure: ready ? undefined : "noIdentifiers",
                },
            );
        },
        [run, defaults.colorHash, defaults.iconHash, defaults.nameHash, ready],
    );

    return {snapshot, ready};
}
