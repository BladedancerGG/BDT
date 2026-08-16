"use client";

import {useTranslations} from "next-intl";
import {useLiveQuery} from "dexie-react-hooks";
import {manifestDb} from "@/lib/manifest/db";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {
    ABILITY_ORDER,
    TRANSCENDENCE_ORDER,
    canSocketBeEmpty,
    subclassSocketKind,
    type SubclassSocketKind,
} from "@/lib/destiny/subclass";
import {useSocketOptions} from "@/lib/destiny/use-sockets";
import type {PlugAvailability} from "@/lib/destiny/use-plug-availability";
import {PlugIcon} from "./PlugIcon";
import {PlugSlot} from "./SocketPicker";

interface SubclassSocket {
    socketIndex: number;
    plugHash: number;
    kind: SubclassSocketKind;
    /** Emplacement verrouillé (fragments non encore déverrouillés) */
    disabled: boolean;
    /** Emplacement libre : le plug en place est le placeholder d'origine */
    empty: boolean;
}

/**
 * Classe les sockets d'une doctrine par nature.
 *
 * La nature vient du plug équipé, dont il faut lire la définition : une lecture
 * groupée dans IndexedDB, une seule fois pour toute la doctrine.
 */
function useSubclassSockets(
    def: InventoryItemDefinition | undefined,
    detail: ItemDetail | undefined,
): SubclassSocket[] {
    return (
        useLiveQuery(
            async () => {
                if (!def?.sockets || !detail?.sockets) return [];

                const hashes = detail.sockets
                    .map((plugHash, socketIndex) => ({plugHash, socketIndex}))
                    .filter((s) => s.plugHash && s.plugHash > 0);

                const rows = await manifestDb.definitions.bulkGet(
                    hashes.map(
                        (s) =>
                            ["DestinyInventoryItemDefinition", s.plugHash] as [string, number],
                    ),
                );

                const disabled = new Set(detail.disabledSockets ?? []);

                const sockets: SubclassSocket[] = [];
                hashes.forEach((s, i) => {
                    const plugDef = rows[i]?.data as InventoryItemDefinition | undefined;
                    const kind = subclassSocketKind(plugDef?.plug?.plugCategoryIdentifier);
                    if (!kind) return;

                    const initial =
                        def.sockets?.socketEntries?.[s.socketIndex]?.singleInitialItemHash;

                    sockets.push({
                        socketIndex: s.socketIndex,
                        plugHash: s.plugHash as number,
                        kind,
                        disabled: disabled.has(s.socketIndex),
                        // Une compétence est toujours équipée, même quand son plug est
                        // resté celui d'origine
                        empty: canSocketBeEmpty(kind) && s.plugHash === initial,
                    });
                });

                return sockets;
            },
            [def, detail],
            [] as SubclassSocket[],
        ) ?? []
    );
}

function Row({
                 title,
                 sockets,
             }: {
    title: string;
    sockets: SubclassSocket[];
}) {
    if (sockets.length === 0) return null;

    return (
        <div className="socket-section">
            <span className="socket-section__title">{title}</span>
            <div className="socket-section__row">
                {sockets.map((socket) => (
                    <PlugIcon
                        key={socket.socketIndex}
                        hash={socket.plugHash}
                        square
                        state={socket.empty ? "available" : "equipped"}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Rangée dont chaque emplacement ouvre son sélecteur : compétences, aspects et
 * fragments.
 *
 * Elle travaille sur des index de sockets, et c'est ce qui la rend utilisable
 * ici : les catégories de sockets d'une doctrine changent avec la classe et
 * l'élément (voir subclass.ts), on ne peut pas les désigner par leur hash.
 *
 * Les compétences tirent leurs options des plugs débloqués du compte
 * (`plugSources: 6`) : trois compétences de classe, huit grenades solaires… Une
 * qui n'en offre qu'une — les supers de stase, par exemple — reste une simple
 * icône, `PlugSlot` n'ouvrant rien quand il n'y a pas de choix.
 */
function EquippableRow({
                           title,
                           def,
                           detail,
                           available,
                           sockets,
                       }: {
    title: string;
    def: InventoryItemDefinition;
    detail: ItemDetail | undefined;
    available: PlugAvailability;
    sockets: SubclassSocket[];
}) {
    // Les index viennent d'un tableau recréé à chaque rendu : le hook en fait
    // sa clé de dépendance par leur contenu.
    const indexes = sockets.map((s) => s.socketIndex);
    const columns = useSocketOptions(def, detail, indexes, available);

    if (columns.length === 0) return null;

    return (
        <div className="socket-section">
            <span className="socket-section__title">{title}</span>
            <div className="socket-section__row">
                {columns.map((column) => (
                    <PlugSlot key={column.socketIndex} column={column} label={title}/>
                ))}
            </div>
        </div>
    );
}

/**
 * Compétences d'une doctrine, en lignes :
 *   1. super, compétence de classe, mouvement, grenade, mêlée
 *   2. transcendance et grenade prismatique — doctrines prismatiques seulement
 *   3. aspects (2 emplacements)
 *   4. fragments (0 à 6 selon les aspects équipés)
 */
export function SubclassSockets({
                                    def,
                                    detail,
                                    available,
                                }: {
    def: InventoryItemDefinition;
    detail: ItemDetail | undefined;
    available: PlugAvailability;
}) {
    const t = useTranslations("subclass");
    const sockets = useSubclassSockets(def, detail);

    if (sockets.length === 0) return null;

    // Ligne 1 : ordre imposé par nature, pas par index de socket
    const abilities = ABILITY_ORDER.flatMap((kind) =>
        sockets.filter((s) => s.kind === kind),
    );

    // Absente des doctrines élémentaires : la ligne ne s'affiche alors pas
    const transcendence = TRANSCENDENCE_ORDER.flatMap((kind) =>
        sockets.filter((s) => s.kind === kind),
    );

    const aspects = sockets.filter((s) => s.kind === "aspect");

    // Les emplacements de fragments verrouillés sont masqués : leur nombre
    // dépend des aspects équipés.
    const fragments = sockets.filter((s) => s.kind === "fragment" && !s.disabled);

    return (
        <>
            {/* La transcendance ne se choisit pas : ses deux emplacements
                découlent de la doctrine prismatique elle-même. */}
            <Row title={t("transcendence")} sockets={transcendence}/>
            <EquippableRow
                title={t("abilities")}
                def={def}
                detail={detail}
                available={available}
                sockets={abilities}
            />
            <EquippableRow
                title={t("aspects")}
                def={def}
                detail={detail}
                available={available}
                sockets={aspects}
            />
            <EquippableRow
                title={t("fragments")}
                def={def}
                detail={detail}
                available={available}
                sockets={fragments}
            />
        </>
    );
}
