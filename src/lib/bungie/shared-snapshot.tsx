"use client";

import {createContext, useContext} from "react";
import type {ItemDetail} from "./item-components";

/**
 * Le détail des objets d'une page qui ne tient **que** d'un instantané.
 *
 * Posée, cette valeur dit deux choses à tout ce qui lit un objet : où trouver
 * son détail, et qu'il n'y a **ni session ni profil** derrière la page. Les
 * deux comptent — `/api/profile` comme `/api/item/[instanceId]` répondraient
 * 401 au visiteur d'un partage, et l'infobulle se contenterait d'attendre une
 * donnée qui n'arriverait jamais.
 *
 * `null` est le cas normal de l'application : le profil fait foi.
 */
const SharedSnapshotContext = createContext<Record<string, ItemDetail> | null>(
    null,
);

export const SharedSnapshotProvider = SharedSnapshotContext.Provider;

/** Le détail des objets de l'instantané, ou `null` hors d'une page partagée. */
export function useSharedSnapshotDetails(): Record<string, ItemDetail> | null {
    return useContext(SharedSnapshotContext);
}

/**
 * La page ne montre-t-elle qu'un instantané ?
 *
 * Autrement dit : **rien n'y est équipable**. Ce qu'on regarde appartient à
 * quelqu'un d'autre, le visiteur n'a pas de session, et un attribut choisi ici
 * n'aurait nulle part où aller — l'insertion partirait vers Bungie au nom d'un
 * compte absent.
 */
export function useSnapshotOnly(): boolean {
    return useContext(SharedSnapshotContext) !== null;
}
