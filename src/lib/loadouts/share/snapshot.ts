// Ce qu'un lien de partage emporte, calculé avant l'envoi.
//
// Un module **pur**, comme `groups/edit.ts` : il reçoit les emplacements à
// partager et de quoi interroger le profil, et rend l'instantané autonome que
// la page publique relira. Rien n'y est réactif, rien n'y part sur le réseau —
// d'où l'absence de "use client". Ses imports de valeur sont relatifs, pour que
// scripts/checks/ puisse l'exécuter.

import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import {savedSockets} from "../../destiny/saved-sockets";
import {isEmptyLoadout} from "../loadout";
import {
    SHARE_NAME_MAX,
    SHARE_VERSION,
    type ShareKind,
    type SharedLoadoutSnapshot,
    type SharedSnapshot,
} from "./types";

/** Ce que le profil doit fournir pour résoudre un instantané. */
export interface ShareSource {
    /** Les objets du compte, par identifiant d'instance */
    items: ReadonlyMap<string, DestinyItemComponent>;
    /** Le détail de chacun, tel que /api/profile le renvoie */
    details: Record<string, ItemDetail>;
    /**
     * Où s'équipe un objet, par hash — `inventory.bucketTypeHash` de sa
     * définition. Une fonction plutôt que la table des définitions : celle-ci
     * pèse tout le manifeste chargé, et seul ce champ sert ici.
     */
    bucketOf: (itemHash: number) => number | undefined;
}

/**
 * L'instantané autonome d'un groupe ou d'un emplacement.
 *
 * Tout l'enjeu tient en une phrase : **le visiteur n'a pas le profil de
 * l'auteur**. Un `DestinyLoadout` ne désigne ses objets que par instance, et une
 * instance ne se résout qu'avec le compte qui la détient — un lien qui en
 * porterait n'afficherait que des lignes vides. Chaque objet est donc résolu
 * ici, une fois pour toutes : son hash, l'emplacement où il s'équipe, son état,
 * et les attributs que l'équipement a enregistrés.
 *
 * C'est aussi ce qui **fige** le partage : le groupe peut changer ensuite, ou
 * disparaître, le lien continue de montrer ce qui a été partagé.
 *
 * Les emplacements vides sont conservés tels quels : ils font partie de la forme
 * du groupe — la grille de la page publique en montre autant que l'auteur en
 * avait, et un emplacement escamoté décalerait tous les suivants.
 *
 * Un objet disparu du compte est simplement absent, comme partout ailleurs
 * (voir `useLoadoutItems`) : sa ligne se montre vide.
 */
export function buildShare(
    kind: ShareKind,
    name: string,
    loadouts: readonly DestinyLoadout[],
    source: ShareSource,
    color?: string,
): SharedSnapshot {
    const details: Record<string, ItemDetail> = {};
    const snapshots: SharedLoadoutSnapshot[] = loadouts.map((loadout) => {
        const entry: SharedLoadoutSnapshot = {
            colorHash: loadout.colorHash,
            iconHash: loadout.iconHash,
            nameHash: loadout.nameHash,
            items: [],
            sockets: {},
        };
        // Un emplacement libre porte tout de même dix entrées, toutes à
        // l'instance « 0 » (voir `isEmptyLoadout`) : les résoudre ne donnerait
        // rien, et les recopier ferait grossir le partage pour du vide.
        if (isEmptyLoadout(loadout)) return entry;

        for (const item of loadout.items) {
            const component = source.items.get(item.itemInstanceId);
            if (!component) continue;
            const detail = source.details[item.itemInstanceId];

            entry.items.push({
                itemHash: component.itemHash,
                itemInstanceId: item.itemInstanceId,
                // Celui de la DÉFINITION : le composant porte l'emplacement où
                // l'objet se trouve, qui est le coffre pour un objet rangé.
                bucketHash:
                    source.bucketOf(component.itemHash) ?? component.bucketHash,
                state: component.state,
                versionNumber: component.versionNumber,
            });
            const sockets = savedSockets(item.plugItemHashes ?? [], detail);
            entry.sockets[item.itemInstanceId] = sockets;
            // Mis en commun : un groupe réemploie souvent la même arme d'un
            // emplacement à l'autre, et le détail en est la partie lourde.
            //
            // Les sockets du détail sont remplacés par ceux que l'équipement a
            // ENREGISTRÉS : c'est ce détail-là que lit l'infobulle du visiteur,
            // et l'état courant de l'objet y aurait montré d'autres attributs
            // que les rangées juste à côté. Les autres index — sockets
            // masqués, verrouillés — restent valables, c'est le même objet.
            if (detail) details[item.itemInstanceId] = {...detail, sockets};
        }

        return entry;
    });

    return {
        version: SHARE_VERSION,
        kind,
        // Tronqué plutôt que refusé : le nom n'est qu'un titre, et un partage
        // ne se perd pas pour quarante caractères de trop.
        name: name.slice(0, SHARE_NAME_MAX),
        ...(color ? {color} : {}),
        loadouts: snapshots,
        details,
    };
}

/**
 * Le partage porte-t-il quelque chose à montrer ?
 *
 * Un groupe dont tous les emplacements sont vides donnerait une page vide : le
 * bouton s'en remet à ce test plutôt que de déposer un lien qui ne montre rien.
 */
export function hasSharedItems(snapshot: SharedSnapshot): boolean {
    return snapshot.loadouts.some((loadout) => loadout.items.length > 0);
}
