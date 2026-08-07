"use client";

import {useMemo} from "react";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import {useSettings} from "@/lib/settings/store";
import {useItemDefs} from "./item-defs";
import {useDisplayableItems} from "./use-displayable-items";
import {sortItems} from "./sort";

/**
 * Objets affichables d'une liste, triés selon les critères réglés par le joueur.
 *
 * Le tri s'appuie sur les définitions déjà préchargées par `ItemDefsProvider` :
 * il reste donc synchrone, sans requête supplémentaire au manifeste.
 */
export function useSortedItems<T extends DestinyItemComponent>(
    items: T[],
    details: Record<string, ItemDetail>,
): T[] {
    const displayed = useDisplayableItems(items);
    const {defs, traits} = useItemDefs();
    const sortRules = useSettings((s) => s.sortRules);

    return useMemo(
        () => sortItems(displayed, {defs, details, traits}, sortRules),
        [displayed, defs, details, traits, sortRules],
    );
}
