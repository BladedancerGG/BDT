"use client";

import {useEffect} from "react";
import {useTranslations} from "next-intl";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {isEmptyLoadout, isRealHash} from "@/lib/loadouts/loadout";
import {
    useLoadoutIdentifierChoices,
    useLoadoutIdentifiers,
} from "@/lib/loadouts/use-loadout-identifiers";
import {
    useLoadoutActionState,
    useLoadoutActions,
} from "@/lib/loadouts/use-loadout-actions";
import {PlusIcon} from "@heroicons/react/24/solid"
import {EmptySlotIcon} from "@/components/icons";

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
    // Sert à donner des identifiants à un emplacement qui n'en a pas — voir
    // `defaults` plus bas.
    const choices = useLoadoutIdentifierChoices();
    const {run} = useLoadoutActions();
    // L'attente et le refus se lisent dans la file : le panneau n'a pas d'état à
    // lui, et l'action lui survit — voir useLoadoutActionState.
    const {busy: acting, error, failure} = useLoadoutActionState(
        characterId,
        selected,
    );

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
     * Identifiants d'un premier enregistrement : le premier choix de chaque
     * liste du jeu.
     *
     * `SnapshotLoadout` **exige les trois**, contrairement à ce que laisse croire
     * leur `nullable` dans le schéma OpenAPI : omis, l'appel repart en
     * `DestinyInvalidRequest` (1622). Et ceux d'un emplacement libre ne
     * conviennent pas davantage — ils valent la sentinelle `INVALID_HASH`, que
     * Bungie refuse tout autant. Il faut donc en fournir de vrais, et l'ordre des
     * constantes est le seul qui ait un sens ici. Le titre permet ensuite de les
     * changer.
     */
    const defaults = {
        colorHash: choices.colors[0]?.hash,
        iconHash: choices.icons[0]?.hash,
        nameHash: choices.names[0]?.hash,
    };
    const hasDefaults =
        defaults.colorHash !== undefined &&
        defaults.iconHash !== undefined &&
        defaults.nameHash !== undefined;

    /** Un identifiant ne part que s'il en est un — voir INVALID_HASH. */
    const keepHash = (hash: number | undefined, fallback: number | undefined) =>
        isRealHash(hash) ? hash : fallback;

    const act = (kind: "equip" | "snapshot" | "clear") => {
        if (!characterId || selected === null) return;
        // Enregistrer sur un emplacement libre sans identifiants à lui donner
        // partirait pour être refusé : l'action entre en file marquée comme
        // telle, et dit pourquoi, plutôt que d'aller chercher un refus.
        const failure =
            kind === "snapshot" && empty && !hasDefaults ? "noIdentifiers" : undefined;
        run(
            {
                kind,
                characterId,
                loadoutIndex: selected,
            // Écraser sans les identifiants ferait perdre couleur, glyphe et
            // nom : ceux en place sont donc réexpédiés. Un emplacement libre n'en
            // a aucun de valide à conserver, il reçoit les valeurs par défaut.
                colorHash: keepHash(current?.colorHash, defaults.colorHash),
                iconHash: keepHash(current?.iconHash, defaults.iconHash),
                nameHash: keepHash(current?.nameHash, defaults.nameHash),
            },
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
                failure,
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
                    const color = identifiers.colors.get(loadout.colorHash);
                    const icon = identifiers.icons.get(loadout.iconHash);

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
                            {!free && color && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={`${BUNGIE_ROOT}${color}`}
                                    alt=""
                                    className="loadout-slot__color"
                                />
                            )}
                            {!free && icon && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={`${BUNGIE_ROOT}${icon}`}
                                    alt={name ?? ""}
                                    className="loadout-slot__icon"
                                />
                            )}
                            {free && (
                                <>
                                    <EmptySlotIcon />
                                    <PlusIcon/>
                                </>
                            )}
                            <span className="loadout-slot__number">{index + 1}</span>
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
                        {/* La touche est annoncée dans le libellé : c'est le
                            seul raccourci de cette vue. */}
                        <kbd className="loadout-panel__key">{t("escapeKey")}</kbd>
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
                        <button
                            type="button"
                            className="btn btn--small loadout-panel__action"
                            // La seule action d'un emplacement libre : il n'y a
                            // rien à y équiper ni à en supprimer.
                            disabled={busy || !characterId}
                            onClick={() => act("snapshot")}
                        >
                            {t(empty ? "create" : "snapshot")}
                        </button>
                        <button
                            type="button"
                            className="btn btn--small loadout-panel__action"
                            disabled={empty || busy || !characterId}
                            onClick={() => act("clear")}
                        >
                            {t("clear")}
                        </button>
                    </div>

                    <button
                        type="button"
                        className="btn btn--small loadout-panel__action loadout-panel__action--link"
                        // Les groupes d'équipements n'existent pas encore
                        disabled
                        title={t("groupsSoon")}
                    >
                        {t("groups")}
                    </button>
                </div>
            )}
        </div>
    );
}
