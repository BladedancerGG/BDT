"use client";

import type {CSSProperties} from "react";
import {useTranslations} from "next-intl";
import {
    useDefinition,
    type DisplayProperties,
} from "@/lib/manifest/use-definition";
import type {Character} from "@/lib/bungie/use-profile";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {useSearchCounts} from "@/lib/search/provider";

interface ClassDefinition {
    displayProperties: DisplayProperties;
}

// Onglet de sélection d'un personnage : emblème + classe + niveau de puissance,
// et, pendant une recherche, le nombre d'objets trouvés chez ce personnage.
export function CharacterTab({
                                 character,
                                 selected,
                                 onSelect,
                             }: {
    character: Character;
    selected: boolean;
    onSelect: () => void;
}) {
    const classDef = useDefinition<ClassDefinition>(
        "DestinyClassDefinition",
        character.classHash,
    );
    const className = classDef?.displayProperties?.name ?? "…";

    // `null` hors recherche : la ligne disparaît alors complètement, plutôt que
    // d'annoncer « 0 objet trouvé » en permanence.
    const t = useTranslations("search");
    const counts = useSearchCounts();
    const found = counts?.byCharacter.get(character.characterId) ?? null;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`character-tab${selected ? " character-tab--selected" : ""}`}>
            {/* L'URL de l'emblème est passée au CSS via une variable */}
            <span
                className="character-tab__emblem"
                style={
                    {
                        "--emblem-url": `url(${BUNGIE_ROOT}${character.emblemBackgroundPath})`,
                    } as CSSProperties
                }/>
            <span className="character-tab__info">
                <span className="character-tab__icon-space"></span>
                <div className="character-tab__text">
                    <span className="character-tab__class">{className}</span>
                    {/* Puissance en haut, résultats de recherche en bas */}
                    <span className="character-tab__aside">
                        <span className="character-tab__power">✦ {character.light}</span>
                        {counts !== null && (
                            <span className="character-tab__found">
                                {t("found", {count: found ?? 0})}
                            </span>
                        )}
                    </span>
                </div>
            </span>
        </button>
    );
}
