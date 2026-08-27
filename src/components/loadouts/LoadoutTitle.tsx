"use client";

import {useMemo, useState} from "react";
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
    type LoadoutIdentifierHashes,
} from "@/lib/loadouts/use-loadout-identifiers";
import {
    useActionOutcome,
    useLoadoutActionState,
    useLoadoutActions,
} from "@/lib/loadouts/use-loadout-actions";

import {PencilIcon, XMarkIcon, CheckIcon} from "@heroicons/react/24/solid"

/** Lequel des deux identifiants visuels est en cours de choix. */
type Target = "color" | "icon";

/** Les trois identifiants d'un emplacement, tels qu'on les modifie. */
type Identifiers = LoadoutIdentifierHashes;

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
 * La modification est **explicite** : un bouton l'ouvre, les choix s'accumulent
 * localement, un second bouton les envoie. Rien ne part avant, et tout part en
 * **une seule requête** — `UpdateLoadoutIdentifiers` écrit les trois valeurs
 * d'un bloc, si bien qu'un envoi par clic aurait été à la fois bavard et
 * ambigu : chacun devait de toute façon réexpédier les deux autres.
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
    const tActions = useTranslations("actions");
    const choices = useLoadoutIdentifierChoices();
    const {run} = useLoadoutActions();
    const {busy: acting, error, failure} = useLoadoutActionState(
        characterId,
        index,
    );
    const [target, setTarget] = useState<Target | null>(null);
    /**
     * Action envoyée pour ce brouillon : on la suit jusqu'à son aboutissement.
     *
     * L'envoi est désormais une mise en file, il rend la main aussitôt — il ne
     * peut donc plus dire s'il a réussi. Le brouillon reste donc à l'écran tant
     * que la file n'a pas conclu, et un refus le laisse réessayable.
     */
    const [submitted, setSubmitted] = useState<string | null>(null);
    const outcome = useActionOutcome(submitted);

    /**
     * Identifiants en cours de modification, ou null hors édition.
     *
     * Un brouillon plutôt qu'un envoi par clic : les trois valeurs voyagent
     * ensemble de toute façon, autant les rassembler avant de partir.
     */
    const [draft, setDraft] = useState<Identifiers | null>(null);

    /**
     * Le brouillon encore en vigueur.
     *
     * Une valeur **dérivée** plutôt qu'un effet qui remettrait `draft` à null :
     * l'aboutissement de l'action suffit à conclure l'édition, et un `setState`
     * dans un effet ne ferait qu'ajouter un rendu en cascade.
     */
    const activeDraft = outcome === "done" ? null : draft;

    // L'enregistré ET le brouillon : c'est ce dernier que l'aperçu doit montrer
    // dès le clic. N'avoir résolu que l'enregistré était le défaut de la
    // première version — l'icône choisie n'apparaissait qu'une fois acceptée par
    // Bungie, puisque son chemin n'avait jamais été lu.
    const resolved = useMemo(
        () => (activeDraft ? [loadout, activeDraft] : [loadout]),
        [loadout, activeDraft],
    );
    const identifiers = useLoadoutIdentifiers(resolved);

    // En édition, c'est le brouillon qui s'affiche : on voit ce qu'on s'apprête
    // à appliquer, pas ce qui est encore enregistré.
    const shown = activeDraft ?? loadout;
    const color = identifiers.colors.get(shown.colorHash);
    const icon = identifiers.icons.get(shown.iconHash);
    const name = identifiers.names.get(shown.nameHash);
    const busy = acting || !characterId;
    const editing = activeDraft !== null;
    // Rien à envoyer si le brouillon n'a rien changé
    const dirty =
        activeDraft !== null &&
        (activeDraft.colorHash !== loadout.colorHash ||
            activeDraft.iconHash !== loadout.iconHash ||
            activeDraft.nameHash !== loadout.nameHash);

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

    /** Note un choix dans le brouillon. Rien ne partira avant « Appliquer ». */
    const edit = (change: Partial<Identifiers>) => {
        setTarget(null);
        setDraft((current) => ({
            colorHash: change.colorHash ?? current?.colorHash ?? loadout.colorHash,
            iconHash: change.iconHash ?? current?.iconHash ?? loadout.iconHash,
            nameHash: change.nameHash ?? current?.nameHash ?? loadout.nameHash,
        }));
    };

    /** Met les trois identifiants en file, d'un bloc. */
    const submit = () => {
        if (!characterId || !activeDraft) return;
        setTarget(null);
        setSubmitted(
            run(
                {
                    kind: "identifiers",
                    characterId,
                    loadoutIndex: index,
                    colorHash: activeDraft.colorHash,
                    iconHash: activeDraft.iconHash,
                    nameHash: activeDraft.nameHash,
                },
                // Ceux du brouillon : c'est l'apparence que l'emplacement aura,
                // et c'est elle que la carte du panneau doit montrer.
                activeDraft,
            ),
        );
    };

    return (
        <div className="loadout-title">

            <div
                // setReference est un callback ref stable de Floating UI
                ref={refs.setReference}
                className={[
                    "loadout-title__tile",
                    // L'écartement au survol n'a de sens qu'en édition : hors
                    // édition il annoncerait deux cibles qui ne s'ouvrent pas.
                    editing ? "loadout-title__tile--editing" : null,
                    target ? "loadout-title__tile--open" : null,
                ]
                    .filter(Boolean)
                    .join(" ")}
            >
                <button
                    type="button"
                    className="loadout-title__part loadout-title__part--color"
                    // Hors édition la vignette n'est qu'une image : rien ne
                    // s'ouvre, et le curseur ne le promet pas.
                    disabled={busy || !editing}
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
                    disabled={busy || !editing}
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

            <p className="loadout-title__name">
                {/* Hors édition le nom est du texte : un contrôle désactivé
                    n'apporterait rien qu'une cible morte dans un titre. */}
                {editing ? (
                    // Un select plutôt qu'une grille : les noms sont du texte, une
                    // liste déroulante native les présente mieux qu'un panneau —
                    // et reste utilisable au clavier sans rien écrire pour ça.
                    <select
                        className="loadout-title__select"
                        value={shown.nameHash}
                        disabled={busy || choices.names.length === 0}
                        aria-label={t("pickName")}
                        onChange={(event) =>
                            edit({nameHash: Number(event.target.value)})
                        }
                    >
                        {/* Le nom courant peut manquer des constantes (nom retiré
                            d'une saison à l'autre) : sans cette option, le select
                            afficherait le premier de la liste à sa place. */}
                        {!choices.names.some((c) => c.hash === shown.nameHash) && (
                            <option value={shown.nameHash}>{name ?? ""}</option>
                        )}
                        {choices.names.map((choice) => (
                            <option key={choice.hash} value={choice.hash}>
                                {choice.value}
                            </option>
                        ))}
                    </select>
                ) : (
                    <>
                        <span className="loadout-title__number">{index + 1} -</span>
                        <span className="loadout-title__value">{name ?? ""}</span>
                    </>
                )}
            </p>

            {/* Ouvrir la modification, puis l'appliquer — une seule requête. */}
            <div className="loadout-title__actions">
                {editing ? (
                    <>
                        <button
                            type="button"
                            aria-label={t("applyIdentifiers")}
                            title={t("applyIdentifiers")}
                            disabled={busy || !dirty}
                            onClick={submit}
                        >
                            <CheckIcon />
                        </button>
                        <button
                            type="button"
                            aria-label={t("cancelIdentifiers")}
                            title={t("cancelIdentifiers")}
                            disabled={busy}
                            onClick={() => {
                                setTarget(null);
                                setDraft(null);
                                setSubmitted(null);
                            }}
                        >
                            <XMarkIcon />
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        aria-label={t("editIdentifiers")}
                        title={t("editIdentifiers")}
                        disabled={busy}
                        onClick={() => {
                            setSubmitted(null);
                            setDraft({
                                colorHash: loadout.colorHash,
                                iconHash: loadout.iconHash,
                                nameHash: loadout.nameHash,
                            });
                        }}
                    >
                        <PencilIcon />
                    </button>
                )}
            </div>

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
                                target === "color" ? shown.colorHash : shown.iconHash
                            }
                            onPick={(hash) =>
                                edit(
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
