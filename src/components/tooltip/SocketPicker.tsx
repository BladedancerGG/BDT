"use client";

import {createContext, useContext, useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {useDefinition} from "@/lib/manifest/use-definition";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {usePlugCatalog, type SocketColumn} from "@/lib/destiny/use-sockets";
import {isFixedPlug} from "@/lib/destiny/sockets";
import {normalizeText} from "@/lib/search/keywords";
import {useInsertPlanner} from "@/lib/actions/use-insert-planner";
import type {QueuedItem} from "@/lib/actions/store";
import {PlugIcon} from "./PlugIcon";

/**
 * Sélecteur d'un socket : la deuxième infobulle, ancrée à droite de la
 * première.
 *
 * Pourquoi une infobulle séparée plutôt qu'une colonne d'options comme pour les
 * attributs d'arme : un socket de mod, de revêtement ou de fragment offre des
 * dizaines de choix (712 revêtements dans le manifeste, une trentaine
 * débloqués sur un compte ordinaire) — de quoi dépasser deux fois la hauteur de
 * l'infobulle d'objet. Ils sont donc présentés en grille, dans un panneau qui
 * s'ouvre au clic sur l'emplacement.
 */

/** Le socket dont le sélecteur est ouvert. */
export interface PickerTarget extends SocketColumn {
    /** Forme des icônes : carrée pour les mods et cosmétiques */
    square: boolean;
    /** Ce que contient le sélecteur, annoncé dans l'infobulle de l'emplacement */
    label?: string;
}

interface SocketPickerValue {
    /**
     * L'objet tel qu'il part en file d'actions. `undefined` pour un objet non
     * instancié : rien n'y est équipable, aucun sélecteur ne s'ouvre.
     */
    item?: QueuedItem;
    target?: PickerTarget;
    toggle: (target: PickerTarget) => void;
    /** Index des sockets verrouillés (fragments non déverrouillés…) */
    disabled: Set<number>;
    /**
     * Attribut attendu dans chaque socket, par index : les insertions en file
     * s'affichent comme équipées sans attendre la réponse de Bungie.
     */
    pending: Map<number, number>;
}

const SocketPickerContext = createContext<SocketPickerValue>({
    toggle: () => {
    },
    disabled: new Set<number>(),
    pending: new Map<number, number>(),
});

export const SocketPickerProvider = SocketPickerContext.Provider;

export function useSocketPicker(): SocketPickerValue {
    return useContext(SocketPickerContext);
}

/**
 * Un emplacement dans une rangée de l'infobulle : le plug équipé, cliquable
 * pour ouvrir le sélecteur du socket.
 *
 * Sans objet instancié, sans autre option que celle en place ou sur un socket
 * verrouillé, il n'y a rien à choisir : l'icône redevient une simple icône.
 *
 * Le libellé annoncé (« Voir les Revêtements ») vient du type du plug équipé,
 * déjà localisé par le manifeste. Les emplacements **vides** n'en ont pas —
 * « Emplacement d'aspect vide » a un `itemTypeDisplayName` à blanc, et ce sont
 * précisément ceux qu'on veut remplir : d'où le repli sur le nom de la rangée.
 */
export function PlugSlot({
                             column,
                             square = true,
                             label,
                         }: {
    column: SocketColumn;
    square?: boolean;
    label?: string;
}) {
    const {item, target, toggle, disabled, pending} = useSocketPicker();
    // L'attribut en file prend la place de celui rendu par l'API : l'emplacement
    // montre ce que l'utilisateur vient de choisir, pas ce qu'il remplace.
    const pendingHash = pending.get(column.socketIndex);
    const shownHash = pendingHash ?? column.equippedHash;
    const def = useDefinition<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        shownHash ?? null,
    );

    if (!shownHash) return null;

    const browsable =
        Boolean(item) &&
        column.options.length > 1 &&
        !disabled.has(column.socketIndex) &&
        // Pièce maîtresse et mémento se paient : l'API refuserait
        !isFixedPlug(def);
    const browseLabel = def?.itemTypeDisplayName || label;

    return (
        <PlugIcon
            hash={shownHash}
            square={square}
            onBrowse={
                browsable
                    ? () => toggle({...column, square, label: browseLabel})
                    : undefined
            }
            browseLabel={browseLabel}
            selected={target?.socketIndex === column.socketIndex}
            busy={pendingHash !== undefined}
        />
    );
}

/**
 * Une icône qui équipe directement son plug, sans passer par un sélecteur.
 *
 * Un seul usage : la réinitialisation d'un artéfact. Son socket n'offre que
 * deux plugs — l'emplacement vide et la remise à zéro — et c'est cette dernière
 * qu'on veut voir et cliquer, pas un emplacement vide à déplier.
 */
export function PlugButton({
                               socketIndex,
                               hash,
                               square = true,
                           }: {
    socketIndex: number;
    hash: number;
    square?: boolean;
}) {
    const {item, pending} = useSocketPicker();
    const insert = useInsertPlanner();

    return (
        <PlugIcon
            hash={hash}
            square={square}
            onEquip={item ? () => insert(item, socketIndex, hash) : undefined}
            busy={pending.get(socketIndex) === hash}
        />
    );
}

/**
 * Contenu du sélecteur : toutes les options équipables du socket, en grille.
 *
 * Le refus de Bungie s'affiche ici plutôt que dans l'infobulle d'objet : c'est
 * dans ce panneau qu'on vient de cliquer.
 */
export function SocketPicker({
                                 target,
                                 error,
                                 failure,
                             }: {
    target: PickerTarget;
    error?: string;
    failure?: string;
}) {
    const t = useTranslations("actions");
    const tItem = useTranslations("item");
    const {item, pending} = useSocketPicker();
    const insert = useInsertPlanner();
    // Une seule lecture du manifeste pour toute la grille, recherche comprise
    const {defs, search} = usePlugCatalog(target.options);

    const [query, setQuery] = useState("");

    // Le plug d'origine ouvre la grille : c'est lui qui vide l'emplacement — mod
    // retiré, revêtement d'origine rendu à l'objet. Vient ensuite ce qui est en
    // place, puis le reste dans l'ordre du jeu.
    const ordered = useMemo(() => {
        // Dédoublonné : un emplacement laissé à son plug d'origine a le même
        // hash des deux côtés, et la grille l'aurait affiché deux fois.
        const first = new Set(
            [target.initialHash, target.equippedHash].filter(
                (hash): hash is number =>
                    hash !== undefined && target.options.includes(hash),
            ),
        );
        return [...first, ...target.options.filter((hash) => !first.has(hash))];
    }, [target.initialHash, target.equippedHash, target.options]);

    // La recherche ne porte que sur le nom et la description — ni le type, ni
    // la famille du plug : ce sont les deux seuls textes que l'utilisateur voit.
    const needle = normalizeText(query.trim());
    const options = needle
        ? ordered.filter((hash) => search.get(hash)?.includes(needle))
        : ordered;

    // L'attribut en file fait référence : c'est lui qui est marqué « équipé », et
    // c'est à lui qu'on compare le clic suivant. Les choix s'enchaînent sans
    // attendre la réponse — la file, elle, reste sérialisée à une requête.
    const equippedHash = pending.get(target.socketIndex) ?? target.equippedHash;

    return (
        <div className="socket-picker">
            <input
                type="search"
                className="socket-picker__search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tItem("searchPlugs")}
                aria-label={tItem("searchPlugs")}
                // Le panneau s'ouvre au clic sur l'emplacement : le curseur est
                // déjà là, la frappe peut commencer sans second clic.
                autoFocus
            />

            <div className="socket-picker__grid">
                {options.map((hash) => (
                    <PlugIcon
                        key={hash}
                        hash={hash}
                        def={defs.get(hash)}
                        square={target.square}
                        state={hash === equippedHash ? "equipped" : "available"}
                        onEquip={
                            item && hash !== equippedHash
                                ? () => insert(item, target.socketIndex, hash)
                                : undefined
                        }
                        busy={pending.get(target.socketIndex) === hash}
                    />
                ))}
            </div>

            {(error || failure) && (
                <p className="socket-picker__error">
                    {failure ? t(`failure.${failure}`) : error}
                </p>
            )}
        </div>
    );
}
