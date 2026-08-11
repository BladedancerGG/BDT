"use client";

import {useDefinition} from "@/lib/manifest/use-definition";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {weaponBreakerType} from "@/lib/destiny/breaker";
import {useBreakerTypeDefinition} from "@/lib/destiny/use-breaker-type";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {PlugIcon} from "./PlugIcon";

/**
 * Troisième section : l'attribut intrinsèque de l'arme (son « archétype »),
 * cadence et impact, et à droite son type anti-champion s'il en a un.
 */
export function WeaponArchetype({
                                    itemHash,
                                    archetypeHash,
                                    breakerType,
                                    rpm,
                                    impact,
                                }: {
    /** L'arme elle-même : clé de la table des exotiques */
    itemHash: number;
    archetypeHash: number;
    /**
     * Effet anti-champion porté par la définition de l'arme (`breakerType`).
     * Seules 17 armes en ont un ; il fait alors autorité.
     */
    breakerType?: number;
    rpm?: number;
    impact?: number;
}) {
    // Une seule lecture de l'armature : son nom s'affiche, et ses perks de
    // sandbox portent l'effet anti-champion.
    const archetype = useDefinition<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        archetypeHash,
    );
    const archetypeName = archetype?.displayProperties?.name ?? "";

    const breaker = useBreakerTypeDefinition(
        weaponBreakerType({
            declared: breakerType,
            itemHash,
            frame: archetype,
        }),
    );
    const breakerIcon = breaker?.displayProperties?.icon;

    return (
        <div className="weapon-archetype">
            <PlugIcon hash={archetypeHash} square={true}/>
            <div className="weapon-archetype__text">
                <div className="weapon-archetype__name">{archetypeName}</div>
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
