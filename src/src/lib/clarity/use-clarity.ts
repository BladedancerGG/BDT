"use client";

import {useQuery, useQueryClient} from "@tanstack/react-query";
import {useEffect} from "react";
import {getDefinitions} from "@/lib/manifest/manifest";
import {useSettings} from "@/lib/settings/store";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {
    clarityIndex,
    resolveClarityHash,
    type ClarityBlock,
    type ClarityDescriptions,
    type ClarityIndex,
} from "./format";

const QUERY_KEY = ["clarity"] as const;

/**
 * Le fichier entier, une fois par page : ~1 700 entrées, quelques centaines de
 * Ko compressés. Le découper par plug coûterait une requête par infobulle pour
 * un gain nul — le navigateur garde le fichier un an (URL immuable), seule
 * l'adresse est redemandée.
 */
async function fetchClarity(): Promise<ClarityDescriptions> {
    const res = await fetch("/api/clarity");
    if (!res.ok) throw new Error(`clarity ${res.status}`);
    const {url} = (await res.json()) as {url: string};
    const file = await fetch(url);
    if (!file.ok) throw new Error(`clarity ${file.status}`);
    return (await file.json()) as ClarityDescriptions;
}

const options = {
    queryKey: QUERY_KEY,
    queryFn: fetchClarity,
    // Le fichier ne change pas pendant la visite ; une publication de Clarity
    // attendra le prochain chargement de page.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    // Sans lui, un échec serait retenté à chaque infobulle ouverte.
    refetchOnMount: false,
} as const;

function plugKey(hash: number, def: InventoryItemDefinition | undefined) {
    return {
        hash,
        name: def?.displayProperties?.name,
        category: def?.plug?.plugCategoryIdentifier,
        tier: def?.inventory?.tierType,
    };
}

/**
 * Index des variantes (voir `clarityIndex`), bâti une fois par page à la
 * première infobulle : une seule lecture groupée des ~1 700 définitions que
 * Clarity décrit, et non une par plug survolé.
 */
async function buildIndex(descriptions: ClarityDescriptions): Promise<ClarityIndex> {
    const hashes = Object.keys(descriptions).map(Number);
    const defs = await getDefinitions<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        hashes,
    );
    return clarityIndex(hashes.map((hash, i) => plugKey(hash, defs[i])));
}

/**
 * Description communautaire d'un plug, si Clarity en a une — sous son hash ou
 * sous celui d'une variante homonyme (voir `resolveClarityHash`).
 * Indisponible (réseau, GitHub), l'infobulle s'en passe simplement.
 */
export function useClarityDescription(
    hash: number | undefined,
    def: InventoryItemDefinition | undefined,
): ClarityBlock[] | undefined {
    // Coupé dans les paramètres : ni téléchargement, ni bloc.
    const enabled = useSettings((s) => s.communityInsights);
    const {data} = useQuery({...options, enabled});
    // Inutile tant qu'un plug a sa propre entrée — le cas le plus courant.
    const needsIndex = Boolean(enabled && hash && data && !data[hash]);
    const {data: index} = useQuery({
        queryKey: [...QUERY_KEY, "index"],
        queryFn: () => buildIndex(data!),
        enabled: needsIndex,
        staleTime: Infinity,
        gcTime: Infinity,
    });
    if (!enabled || !hash || !data) return undefined;
    const resolved = resolveClarityHash(plugKey(hash, def), data, index);
    return resolved ? data[resolved] : undefined;
}

/**
 * Lance le téléchargement avant la première infobulle : sans lui, la première
 * survolée s'ouvre sans le bloc, puis grandit sous le curseur quand il arrive.
 */
export function usePrefetchClarity(): void {
    const client = useQueryClient();
    const enabled = useSettings((s) => s.communityInsights);
    useEffect(() => {
        if (enabled) void client.prefetchQuery(options);
    }, [client, enabled]);
}
