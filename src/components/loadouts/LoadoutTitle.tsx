"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {
    useFloating,
    useDismiss,
    useInteractions,
    offset,
    flip,
    shift,
    autoUpdate,
    FloatingPortal,
} from "@floating-ui/react";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {
    useLoadoutIdentifierChoices,
    useLoadoutIdentifiers,
    type IdentifierChoice,
} from "@/lib/loadouts/use-loadout-identifiers";
import {useLoadoutActions} from "@/lib/loadouts/use-loadout-actions";

/** Lequel des deux identifiants visuels est en cours de choix. */
type Target = "color" | "icon";

/**
 * Enveloppe un emplacement dans un tableau pour la lecture groupée.
 *
 * Un littéral `[loadout]` serait recréé à chaque rendu ; le hook fait sa clé de
 * dépendance du contenu, mais autant ne pas lui donner de raison de douter.
 */
const SINGLE = (loadout: DestinyLoadout): DestinyLoadout[] => [loadout];

/**
 * Grille des choix d'un identifiant, dans un panneau flottant.
 *
 * Elle emprunte l'habillage du sélecteur de sockets (`.socket-picker`) : c'est
 * le même geste — cliquer une vignette, choisir dans une grille — et la
 * maquette le demande explicitement. Le contenu, lui, n'est pas fait de plugs :
 * ce sont de simples images du manifeste, sans définition d'objet derrière.
 */
function IdentifierPicker({
                              choices,
                              current,
                              kind,
                              onPick,
                          }: {
    choices: IdentifierChoice[];
    current: number;
    kind: Target;
    onPick: (hash: number) => void;
}) {
    const t = useTranslations("loadouts");

    return (
        <div className="socket-picker loadout-identifiers">
            <div className="socket-picker__grid">
                {choices.map((choice) => (
                    <button
                        key={choice.hash}
                        type="button"
                        className={[
                            "loadout-identifiers__choice",
                            `loadout-identifiers__choice--${kind}`,
                            choice.hash === current
                                ? "loadout-identifiers__choice--current"
                                : null,
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        aria-pressed={choice.hash === current}
                        aria-label={t(kind === "color" ? "pickColor" : "pickIcon")}
                        onClick={() => onPick(choice.hash)}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${BUNGIE_ROOT}${choice.value}`} alt=""/>
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * Titre du mode « équipements » quand un emplacement est sélectionné :
 * « 3 - Solaire », et sous lui la vignette de l'équipement.
 *
 * La vignette est composite — fond coloré et glyphe sont deux images distinctes
 * du manifeste, Bungie n'en fournit pas l'assemblage. Au survol elles
 * **s'écartent** : chacune devient alors sa propre cible, avec sa grille de
 * choix. Le nom, lui, est un `<select>` sans habillage, qui ne se signale qu'au
 * survol pour ne pas alourdir le titre.
 *
 * Les trois valeurs partent ensemble : l'endpoint `UpdateLoadoutIdentifiers` les
 * écrit d'un bloc, en envoyer une seule remettrait les deux autres par défaut.
 */
export function LoadoutTitle({
                                 loadout,
                                 index,
                                 characterId,
                                 empty,
                             }: {
    loadout: DestinyLoadout;
    /** Place dans la liste, à partir de 0 — affichée à partir de 1 */
    index: number;
    characterId: string | null;
    /**
     * Emplacement libre. Il n'a ni couleur, ni glyphe, ni nom à montrer — et
     * rien à renommer non plus : `UpdateLoadoutIdentifiers` n'a de sens que sur
     * un emplacement qui existe. Le titre se réduit alors à son numéro, ce qui
     * reste nécessaire : c'est la seule indication de l'emplacement que
     * l'écrasement va remplir.
     */
    empty: boolean;
}) {
    const t = useTranslations("loadouts");
    const choices = useLoadoutIdentifierChoices();
    // Le seul emplacement affiché ici : la lecture groupée n'en résout qu'un
    const identifiers = useLoadoutIdentifiers(SINGLE(loadout));
    const {run, pending, error} = useLoadoutActions();
    const [target, setTarget] = useState<Target | null>(null);

    const color = identifiers.colors.get(loadout.colorHash);
    const icon = identifiers.icons.get(loadout.iconHash);
    const name = identifiers.names.get(loadout.nameHash);
    const busy = pending !== null || !characterId;

    const {refs, floatingStyles, context} = useFloating({
        open: target !== null,
        onOpenChange: (open) => !open && setTarget(null),
        placement: "bottom",
        middleware: [offset(8), flip(), shift({padding: 8})],
        whileElementsMounted: autoUpdate,
    });

    // Clic extérieur et Échap referment la grille. Échap n'atteint alors pas la
    // désélection de l'emplacement (voir LoadoutPanel) : le geste referme ce qui
    // est ouvert avant de défaire ce qui est choisi.
    const dismiss = useDismiss(context);
    const {getFloatingProps} = useInteractions([dismiss]);

    if (empty) {
        return (
            <div className="loadout-title">
                <p className="loadout-title__name">
                    <span className="loadout-title__number">{index + 1} -</span>
                    <span className="loadout-title__free">{t("freeSlot")}</span>
                </p>
            </div>
        );
    }

    const apply = (change: {
        colorHash?: number;
        iconHash?: number;
        nameHash?: number;
    }) => {
        setTarget(null);
        if (!characterId) return;
        // Les trois valeurs partent ensemble, même celles qui ne changent pas :
        // l'endpoint les écrit d'un bloc.
        void run({
            kind: "identifiers",
            characterId,
            loadoutIndex: index,
            colorHash: change.colorHash ?? loadout.colorHash,
            iconHash: change.iconHash ?? loadout.iconHash,
            nameHash: change.nameHash ?? loadout.nameHash,
        });
    };

    return (
        <div className="loadout-title">
            <p className="loadout-title__name">
                <span className="loadout-title__number">{index + 1} -</span>
                {/* Un select plutôt qu'une grille : les noms sont du texte, une
                    liste déroulante native les présente mieux qu'un panneau —
                    et reste utilisable au clavier sans rien écrire pour ça. */}
                <select
                    className="loadout-title__select"
                    value={loadout.nameHash}
                    disabled={busy || choices.names.length === 0}
                    aria-label={t("pickName")}
                    onChange={(event) =>
                        apply({nameHash: Number(event.target.value)})
                    }
                >
                    {/* Le nom courant peut manquer des constantes (nom retiré
                        d'une saison à l'autre) : sans cette option, le select
                        afficherait le premier de la liste à sa place. */}
                    {!choices.names.some((c) => c.hash === loadout.nameHash) && (
                        <option value={loadout.nameHash}>{name ?? ""}</option>
                    )}
                    {choices.names.map((choice) => (
                        <option key={choice.hash} value={choice.hash}>
                            {choice.value}
                        </option>
                    ))}
                </select>
            </p>

            <div
                // setReference est un callback ref stable de Floating UI
                ref={refs.setReference}
                className={`loadout-title__tile${
                    target ? " loadout-title__tile--open" : ""
                }`}
            >
                <button
                    type="button"
                    className="loadout-title__part loadout-title__part--color"
                    disabled={busy}
                    aria-label={t("pickColor")}
                    aria-expanded={target === "color"}
                    onClick={() => setTarget((c) => (c === "color" ? null : "color"))}
                >
                    {color && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`${BUNGIE_ROOT}${color}`} alt=""/>
                    )}
                </button>

                <button
                    type="button"
                    className="loadout-title__part loadout-title__part--icon"
                    disabled={busy}
                    aria-label={t("pickIcon")}
                    aria-expanded={target === "icon"}
                    onClick={() => setTarget((c) => (c === "icon" ? null : "icon"))}
                >
                    {icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`${BUNGIE_ROOT}${icon}`} alt=""/>
                    )}
                </button>
            </div>

            {/* Le refus de Bungie est déjà localisé — voir /api/loadouts. */}
            {error && (
                <p className="loadout-title__error">
                    {error.message ?? t("failed")}
                </p>
            )}

            {target && (
                <FloatingPortal>
                    <div
                        // setFloating est un callback ref stable de Floating UI
                        // eslint-disable-next-line react-hooks/refs
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps()}
                        className="floating-layer floating-layer--picker"
                    >
                        <IdentifierPicker
                            kind={target}
                            choices={target === "color" ? choices.colors : choices.icons}
                            current={
                                target === "color" ? loadout.colorHash : loadout.iconHash
                            }
                            onPick={(hash) =>
                                apply(
                                    target === "color"
                                        ? {colorHash: hash}
                                        : {iconHash: hash},
                                )
                            }
                        />
                    </div>
                </FloatingPortal>
            )}
        </div>
    );
}
