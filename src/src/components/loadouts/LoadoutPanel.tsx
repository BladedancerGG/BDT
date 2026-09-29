"use client";

import {useEffect} from "react";
import {useTranslations} from "next-intl";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import {useLoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import {useSnapshotLoadout} from "@/lib/loadouts/use-snapshot-loadout";
import {
    useLoadoutActionState,
    useLoadoutActions,
} from "@/lib/loadouts/use-loadout-actions";
import {DestinySymbol} from "@/components/DestinySymbol";
import {LoadoutSlotTile} from "./LoadoutSlotTile";

/**
 * Les emplacements d'équipement du personnage, et les actions du sélectionné.
 *
 * Le nombre d'emplacements n'est pas codé ici : c'est celui que renvoie le
 * composant 206, qui suit ce que le compte a débloqué.
 *
 * Un emplacement libre reste cliquable — on peut vouloir y enregistrer
 * l'équipement porté — mais seul « Écraser » lui est proposé : il n'y a rien à
 * équiper ni à supprimer.
 */
export function LoadoutPanel({
                                 loadouts,
                                 characterId,
                                 selected,
                                 onSelect,
                             }: {
    loadouts: readonly DestinyLoadout[];
    characterId: string | null;
    /** Index de l'emplacement sélectionné, ou null */
    selected: number | null;
    onSelect: (index: number | null) => void;
}) {
    const t = useTranslations("loadouts");
    const identifiers = useLoadoutIdentifiers(loadouts);
    const {snapshot} = useSnapshotLoadout();
    const {run} = useLoadoutActions();
    // L'attente et le refus se lisent dans la file : le panneau n'a pas d'état à
    // lui, et l'action lui survit — voir useLoadoutActionState.
    // Seule l'attente intéresse le panneau : un refus s'affiche dans la file
    // d'actions, où l'action a sa carte.
    const {busy: acting} = useLoadoutActionState(characterId, selected);

    // Échap désélectionne. Le geste n'est pris que s'il ne sert à rien d'autre :
    // un sélecteur ouvert le garde pour lui (c'est lui qu'on veut refermer), et
    // une modale piège de toute façon le clavier.
    useEffect(() => {
        if (selected === null) return;
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("[role='dialog']")) return;
            if (document.querySelector(".socket-picker")) return;
            onSelect(null);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [selected, onSelect]);

    const current = selected !== null ? loadouts[selected] : undefined;
    const empty = isEmptyLoadout(current);
    const busy = acting;

    /**
     * Équiper ou vider : ni l'un ni l'autre ne touche à l'apparence de
     * l'emplacement, et les endpoints correspondants ignorent les identifiants.
     * L'enregistrement, lui, en exige — il passe par `useSnapshotLoadout`.
     */
    const act = (kind: "equip" | "clear") => {
        if (!characterId || selected === null) return;
        run(
            {kind, characterId, loadoutIndex: selected},
            {
                // Recopiés dans l'action : la carte du panneau redessine la
                // vignette de l'emplacement, et survit à un `clear` qui le vide.
                colorHash: current?.colorHash ?? 0,
                iconHash: current?.iconHash ?? 0,
                nameHash: current?.nameHash ?? 0,
                // Les vignettes à griser pendant l'attente. Seul un équipement
                // déplace des objets ; les entrées « 0 » d'un emplacement
                // partiellement enregistré n'en désignent aucun.
                itemInstanceIds:
                    kind === "equip"
                        ? (current?.items ?? [])
                            .map((item) => item.itemInstanceId)
                            .filter((id) => id && id !== "0")
                        : [],
            },
        );
    };

    // Le composant 206 n'a rien renvoyé pour ce personnage. Une grille vide
    // serait indiscernable d'un chargement en cours : mieux vaut le dire.
    if (loadouts.length === 0) {
        return (
            <div className="loadout-panel">
                <p className="loadout-panel__empty">{t("noSlots")}</p>
            </div>
        );
    }

    return (
        <div className="loadout-panel">
            <div className="loadout-panel__grid">
                {loadouts.map((loadout, index) => {
                    const free = isEmptyLoadout(loadout);
                    const name = identifiers.names.get(loadout.nameHash);

                    return (
                        <button
                            key={index}
                            type="button"
                            className={[
                                "loadout-slot",
                                free ? "loadout-slot--empty" : null,
                                index === selected ? "loadout-slot--selected" : null,
                            ]
                                .filter(Boolean)
                                .join(" ")}
                            aria-pressed={index === selected}
                            // Un emplacement libre porte les identifiants par
                            // défaut du jeu : afficher ce nom-là ferait croire
                            // qu'il contient quelque chose.
                            title={(free ? undefined : name) ?? t("slot", {number: index + 1})}
                            // Recliquer l'emplacement sélectionné le désélectionne :
                            // c'est le geste attendu, et il double le bouton dédié.
                            onClick={() => onSelect(index === selected ? null : index)}
                        >
                            <LoadoutSlotTile
                                loadout={loadout}
                                index={index}
                                identifiers={identifiers}
                            />
                        </button>
                    );
                })}
            </div>

            {/* Boutons d'action : rien à proposer sans emplacement sélectionné */}
            {selected !== null && (
                <div className="loadout-panel__actions">
                    <button
                        type="button"
                        className="btn btn--small loadout-panel__action"
                        onClick={() => onSelect(null)}
                    >
                        {t("deselect")}
                        <DestinySymbol name={"key_escape"} />
                    </button>

                    <div className="loadout-panel__action-group">
                        <button
                            type="button"
                            className="btn btn--small loadout-panel__action"
                            // Un emplacement libre n'a rien à équiper
                            disabled={empty || busy || !characterId}
                            onClick={() => act("equip")}
                        >
                            {t("equip", {number: selected + 1})}
                        </button>
                        {/* Un emplacement libre n'a rien à écraser : son unique
                            geste est proposé au centre de l'équipement, là où le
                            vide a laissé la place — voir LoadoutCreateButton. */}
                        {!empty && (
                            <button
                                type="button"
                                className="btn btn--small loadout-panel__action"
                                disabled={busy || !characterId}
                                onClick={() =>
                                    characterId &&
                                    selected !== null &&
                                    snapshot(characterId, selected, current)
                                }
                            >
                                {t("snapshot")}
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn--small btn--danger loadout-panel__action"
                            disabled={empty || busy || !characterId}
                            onClick={() => act("clear")}
                        >
                            {t("clear")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
