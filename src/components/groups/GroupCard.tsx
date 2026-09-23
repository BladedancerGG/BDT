"use client";

import type {CSSProperties, ReactNode} from "react";
import {useTranslations} from "next-intl";
import {useSortable} from "@dnd-kit/sortable";
import type {DestinyLoadout} from "@/lib/bungie/profile";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import type {LoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import {LoadoutSlotTile} from "@/components/loadouts/LoadoutSlotTile";
import {Hint} from "@/components/ui/Hint";
import {
    ArrowDownTrayIcon,
    DocumentDuplicateIcon,
    PencilSquareIcon,
    ShareIcon,
    TrashIcon,
} from "@heroicons/react/24/solid";

interface GroupCardProps {
    name: string;
    loadouts: readonly DestinyLoadout[];
    slotCount: number;
    identifiers: LoadoutIdentifiers;
    /**
     * Chaque action absente n'est pas dessinée. La carte des équipements du jeu
     * n'a ni « Équiper » — c'est déjà ce que porte le personnage — ni
     * « Supprimer » : ce n'est pas un groupe.
     */
    onEquip?: () => void;
    onEdit?: () => void;
    /** Dépose un partage du groupe et en montre le lien */
    onShare?: () => void;
    onDuplicate?: () => void;
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
 * Les actions sont une rangée d'icônes sous la grille, toujours visibles : le
 * calque révélé au survol les rendait inatteignables au doigt, et masquait
 * l'aperçu qu'on venait justement regarder. Leur libellé passe dans une
 * infobulle, et dans `aria-label`.
 */
export function GroupCard({
                              name,
                              loadouts,
                              slotCount,
                              identifiers,
                              onEquip,
                              onEdit,
                              onShare,
                              onDuplicate,
                              onDelete,
                              handle,
                          }: GroupCardProps & {
    /** Poignée de déplacement, fournie par `SortableGroupCard` */
    handle?: ReactNode;
}) {
    const tLoadouts = useTranslations("loadouts");
    const tCommon = useTranslations("common");

    // Seules les actions fournies sont dessinées : la carte des équipements du
    // jeu n'a ni « Équiper » ni « Supprimer », et des boutons grisés y
    // laisseraient deviner pourquoi.
    const actions = [
        {label: tCommon("equip"), Icon: ArrowDownTrayIcon, onClick: onEquip, variant: "primary"},
        {label: tCommon("edit"), Icon: PencilSquareIcon, onClick: onEdit},
        {label: tCommon("share"), Icon: ShareIcon, onClick: onShare},
        {label: tCommon("duplicate"), Icon: DocumentDuplicateIcon, onClick: onDuplicate},
        {label: tCommon("delete"), Icon: TrashIcon, onClick: onDelete, variant: "danger"},
    ].filter((action) => action.onClick);

    return (
        <>
            <div className="group-card__header">
                {handle}
                <h3 className="group-card__name">{name}</h3>
            </div>

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

                {actions.length > 0 && (
                    <div className="group-card__actions">
                        {actions.map((action) => (
                            <Hint key={action.label} actions={[{label: action.label}]}>
                                <button
                                    type="button"
                                    className={[
                                        "btn btn--small group-card__action",
                                        action.variant === "danger" && "btn--danger",
                                        action.variant && `group-card__action--${action.variant}`,
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    // L'icône seule ne dit rien à un lecteur
                                    // d'écran, ni à un doigt : l'infobulle ne
                                    // s'ouvre pas sans survol.
                                    aria-label={action.label}
                                    onClick={action.onClick}
                                >
                                    <action.Icon aria-hidden/>
                                </button>
                            </Hint>
                        ))}
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
 * Le geste part d'une **poignée** et non de la carte entière : celle-ci porte une
 * rangée de boutons, qu'un seuil de déplacement ne suffirait pas à protéger d'un
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
 * La carte des équipements du jeu : ni déplaçable, ni colorée.
 *
 * Ses actions sont celles qui ont un sens sur l'état courant du personnage —
 * modifier (dans la vue qui les manipule), partager, dupliquer en groupe. La
 * carte elle-même n'est plus cliquable : elle porte désormais des boutons, et
 * un clic à côté d'eux ne doit rien déclencher.
 */
export function StaticGroupCard(card: GroupCardProps) {
    return (
        <section className="group-card group-card--static" aria-label={card.name}>
            <GroupCard {...card} />
        </section>
    );
}
