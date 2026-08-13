"use client";

import {useDefinition} from "@/lib/manifest/use-definition";
import {usePlugSummary} from "@/lib/destiny/use-plug-description";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {PlugIcon} from "./PlugIcon";

/**
 * Attribut intrinsèque d'une armure exotique : ce qui la définit.
 *
 * Même mise en page que l'armature d'une arme (`.intrinsic-row`) : icône, nom, et
 * en dessous le résumé de l'effet. Ce résumé vient des perks de sandbox et non de
 * la description du plug, laquelle détaille le fonctionnement complet sur
 * plusieurs phrases — trop long ici. La description entière reste accessible au
 * survol de l'icône.
 */
export function ArmorIntrinsic({hash}: { hash: number }) {
    const def = useDefinition<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        hash,
    );
    const summary = usePlugSummary(def);
    const name = def?.displayProperties?.name;
    if (!name) return null;

    return (
        <div className="intrinsic-row">
            <PlugIcon hash={hash} square={true}/>
            <div className="intrinsic-row__text">
                <div className="intrinsic-row__name">{name}</div>
                {summary && <div className="intrinsic-row__detail">{summary}</div>}
            </div>
        </div>
    );
}
