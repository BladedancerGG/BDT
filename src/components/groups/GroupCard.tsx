"use client";

import type {CSSProperties, ReactNode} from "react";
import {useTranslations} from "next-intl";
import {useSortable} from "@dnd-kit/sortable";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import type {LoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import {LoadoutSlotTile} from "@/components/loadouts/LoadoutSlotTile";

interface GroupCardProps {
    name: string;
    loadouts: readonly DestinyLoadout[];
    slotCount: number;
    identifiers: LoadoutIdentifiers;
    /**
     * Absentes sur la carte des équipements du jeu : elle montre l'état courant
     * du personnage, il n'y a rien à y équiper, modifier ni supprimer.
     */
    onEquip?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}

/**
 * Une carte de la page des groupes : son nom, et la grille de ses emplacements.
 *
 * La grille fait toujours la taille du personnage — `slotCount`, celui que
 * renvoie le composant 206 — et non celle du groupe : un compte qui débloque un
 * emplacement de plus doit le voir apparaître, vide, sur ses groupes existants,
 * plutôt que de les voir amputés. Les emplacements manquants sont simplement
 * absents du tableau, ce que `LoadoutSlotTile` dessine comme libre.
 *
 * Les actions sont dans un calque révélé au survol, comme le demande la
 * maquette. Elles restent dans le DOM et atteignables au clavier : c'est le CSS
 * qui les découvre, sur `:hover` comme sur `:focus-within`.
 */
export function GroupCard({
                              name,
                              loadouts,
                              slotCount,
                              identifiers,
                              onEquip,
                              onEdit,
                              onDelete,
                              handle,
                          }: GroupCardProps & {
    /** Poignée de déplacement, fournie par `SortableGroupCard` */
    handle?: ReactNode;
}) {
    const tLoadouts = useTranslations("loadouts");
    const tCommon = useTranslations("common");

    const hasActions = Boolean(onEquip || onEdit || onDelete);

    return (
        <>
            <div className="group-card__header">
                {handle}
                <h3 className="group-card__name">{name}</h3>
            </div>

            {/* La grille et le calque d'actions dans un même bloc, dont
                l'en-tête est EXCLU.
                Le calque couvre `inset: 0` de son bloc conteneur : tant que
                c'était la carte entière, il recouvrait la poignée de
                déplacement dès que le survol l'activait — et le glisser-déposer
                des cartes était tout bonnement impossible. */}
            <div className="group-card__body">
                <div className="group-card__grid">
                    {Array.from({length: slotCount}, (_, index) => {
                        const loadout = loadouts[index];
                        const free = isEmptyLoadout(loadout);
                        const label = loadout && identifiers.names.get(loadout.nameHash);

                        return (
                            <div
                                key={index}
                                className={`loadout-slot${free ? " loadout-slot--empty" : ""}`}
                                // Un emplacement libre porte les identifiants par
                                // défaut du jeu : afficher ce nom-là ferait croire
                                // qu'il contient quelque chose.
                                title={
                                    (free ? undefined : label) ??
                                    tLoadouts("slot", {number: index + 1})
                                }
                            >
                                <LoadoutSlotTile
                                    loadout={loadout}
                                    index={index}
                                    identifiers={identifiers}
                                />
                            </div>
                        );
                    })}
                </div>

                {hasActions && (
                    <div className="group-card__actions">
                        <button
                            type="button"
                            className="btn btn--small btn--primary group-card__action"
                            disabled={!onEquip}
                            onClick={onEquip}
                        >
                            {tCommon("equip")}
                        </button>
                        <button
                            type="button"
                            className="btn btn--small group-card__action"
                            disabled={!onEdit}
                            onClick={onEdit}
                        >
                            {tCommon("edit")}
                        </button>
                        <button
                            type="button"
                            className="btn btn--small btn--danger group-card__action"
                            onClick={onDelete}
                        >
                            {tCommon("delete")}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}

/**
 * La même carte, déplaçable.
 *
 * Un composant à part et non un `id` facultatif sur `GroupCard` : la carte des
 * équipements du jeu n'est pas un groupe et ne se déplace pas, or `useSortable`
 * est un hook — l'appeler sous condition est interdit, et l'appeler pour rien
 * l'inscrirait tout de même dans les nœuds déplaçables de dnd-kit.
 *
 * Le geste part d'une **poignée** et non de la carte entière : celle-ci porte un
 * calque de boutons, qu'un seuil de déplacement ne suffirait pas à protéger d'un
 * clic interprété de travers.
 */
export function SortableGroupCard({
                                      id,
                                      position,
                                      total,
                                      color,
                                      ...card
                                  }: GroupCardProps & {
    id: string;
    /**
     * Couleur de la bordure, pour reconnaître la carte d'un coup d'œil.
     *
     * Elle appartient au **cadre** et non au contenu — d'où sa place ici plutôt
     * que dans `GroupCardProps` : c'est cette section-ci qui porte la bordure,
     * et la carte des équipements du jeu n'en a jamais.
     */
    color?: string;
    /** Place dans la liste, à partir de 1 — annoncée par la poignée */
    position: number;
    total: number;
}) {
    const t = useTranslations("groups");
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} =
        useSortable({id});

    return (
        <section
            ref={setNodeRef}
            style={{
                transform: transform
                    ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
                    : undefined,
                transition,
                // La couleur est choisie par l'utilisateur : c'est exactement le
                // cas où le style en ligne est de mise, une règle SCSS ne
                // pouvant pas énumérer les valeurs possibles. Elle passe par une
                // variable, que la bordure de la carte lit — voir le SCSS.
                ...(color ? ({"--group-color": color} as CSSProperties) : undefined),
            }}
            className={`group-card${isDragging ? " group-card--dragging" : ""}`}
            aria-label={card.name}
        >
            <GroupCard
                {...card}
                handle={
                    <button
                        type="button"
                        className="group-card__handle"
                        aria-label={t("moveCard", {
                            name: card.name,
                            position,
                            total,
                        })}
                        {...attributes}
                        {...listeners}
                    >
                        {/* Poignée décorative : le bouton porte déjà son libellé */}
                        <span aria-hidden>⣿</span>
                    </button>
                }
            />
        </section>
    );
}

/**
 * La carte des équipements du jeu : ni déplaçable, ni porteuse d'actions.
 *
 * Elle est en revanche **cliquable** : elle mène au mode « équipements », où
 * ces emplacements-là se manipulent pour de bon. C'est la seule carte dont le
 * contenu existe ailleurs dans l'application.
 *
 * `role="button"` sur une `<section>` plutôt qu'un vrai `<button>` : le modèle
 * de contenu d'un bouton n'admet pas de contenu de flux, et la carte est faite
 * de blocs. Le clavier est donc recâblé à la main — Entrée et Espace, ce qu'un
 * bouton aurait donné gratuitement.
 */
export function StaticGroupCard({
                                    onOpen,
                                    ...card
                                }: GroupCardProps & {onOpen?: () => void}) {
    return (
        <section
            className={`group-card group-card--static${
                onOpen ? " group-card--clickable" : ""
            }`}
            aria-label={card.name}
            role={onOpen ? "button" : undefined}
            tabIndex={onOpen ? 0 : undefined}
            onClick={onOpen}
            onKeyDown={
                onOpen
                    ? (event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        // Espace ferait défiler la page, Entrée n'a rien à
                        // déclencher d'autre : le geste est absorbé.
                        event.preventDefault();
                        onOpen();
                    }
                    : undefined
            }
        >
            <GroupCard {...card} />
        </section>
    );
}
