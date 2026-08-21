"use client";

import {useEffect} from "react";
import {useTranslations} from "next-intl";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {useLoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import {useLoadoutActions} from "@/lib/loadouts/use-loadout-actions";

/** Un emplacement est libre quand il ne contient aucun objet — voir DestinyLoadout. */
export const isEmptyLoadout = (loadout: DestinyLoadout | undefined): boolean =>
    !loadout || loadout.items.length === 0;

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
    const {run, pending, error} = useLoadoutActions();

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
    const busy = pending !== null;

    const act = (kind: "equip" | "snapshot" | "clear") => {
        if (!characterId || selected === null) return;
        void run({
            kind,
            characterId,
            loadoutIndex: selected,
            // Écraser sans les identifiants ferait perdre couleur, glyphe et nom.
            // Un emplacement libre, lui, n'en a aucun à conserver : on les omet
            // et Bungie pose les siens. Les renvoyer serait au mieux inutile, au
            // pire un refus — rien ne garantit que le jeu remplisse ces trois
            // champs sur un emplacement qu'il considère vide.
            colorHash: empty ? undefined : current?.colorHash,
            iconHash: empty ? undefined : current?.iconHash,
            nameHash: empty ? undefined : current?.nameHash,
        });
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

                    {/* Le refus de Bungie est déjà localisé : plus utile que le
                        nôtre — voir /api/loadouts. */}
                    {error && (
                        <p className="loadout-panel__error">
                            {error.message ?? t("failed")}
                        </p>
                    )}

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
