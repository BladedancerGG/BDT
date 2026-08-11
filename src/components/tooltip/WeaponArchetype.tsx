"use client";

import {useDefinition} from "@/lib/manifest/use-definition";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import type {
    BreakerTypeDefinition,
    InventoryItemDefinition,
} from "@/lib/destiny/types";
import {PlugIcon} from "./PlugIcon";

function ArchetypeName({hash}: { hash: number }) {
    const def = useDefinition<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        hash,
    );
    return <>{def?.displayProperties?.name ?? ""}</>;
}

/**
 * Troisième section : l'attribut intrinsèque de l'arme (son « archétype »),
 * cadence et impact, et à droite son type anti-champion s'il en a un.
 */
export function WeaponArchetype({
                                    archetypeHash,
                                    breakerTypeHash,
                                    rpm,
                                    impact,
                                }: {
    archetypeHash: number;
    /** Résolu dans DestinyBreakerTypeDefinition : bloqueur, surchargé, implacable */
    breakerTypeHash?: number;
    rpm?: number;
    impact?: number;
}) {
    // `breakerTypeHash` vaut 0 sur les armes sans type anti-champion : le hook
    // s'arrête de lui-même sur une valeur fausse.
    const breaker = useDefinition<BreakerTypeDefinition>(
        "DestinyBreakerTypeDefinition",
        breakerTypeHash || undefined,
    );
    const breakerIcon = breaker?.displayProperties?.icon;

    return (
        <div className="weapon-archetype">
            <PlugIcon hash={archetypeHash} square={true}/>
            <div className="weapon-archetype__text">
                <div className="weapon-archetype__name">
                    <ArchetypeName hash={archetypeHash}/>
                </div>
                {(rpm != null || impact != null) && (
                    <div className="weapon-archetype__detail">
                        {rpm != null && `${rpm} rpm`}
                        {rpm != null && impact != null && " / "}
                        {impact != null && `${impact} impact`}
                    </div>
                )}
            </div>
            {breakerIcon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={`${BUNGIE_ROOT}${breakerIcon}`}
                    alt={breaker?.displayProperties?.name ?? ""}
                    title={breaker?.displayProperties?.name}
                    className="weapon-archetype__breaker"
                />
            )}
        </div>
    );
}
