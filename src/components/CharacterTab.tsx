"use client";

import type {ComponentPropsWithRef, CSSProperties} from "react";
import {useTranslations} from "next-intl";
import {
    useDefinition,
    type DisplayProperties,
} from "@/lib/manifest/use-definition";
import type {Character} from "@/lib/bungie/use-profile";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {useSearchCounts} from "@/lib/search/provider";
import {ClassIcon} from "./ClassIcon";

interface ClassDefinition {
    displayProperties: DisplayProperties;
}

/**
 * Un personnage dans le sélecteur de l'en-tête : symbole de classe, emblème en
 * fond, nom de classe et niveau de puissance — et, pendant une recherche, le
 * nombre d'objets trouvés chez lui.
 *
 * Les attributs du bouton sont **passés tels quels** : c'est `CharacterPicker`
 * qui le monte dans son menu déroulant, et Floating UI y pose son rôle, sa
 * place dans la navigation aux flèches et le gestionnaire de clic.
 */
export function CharacterTab({
                                 character,
                                 selected,
                                 ...buttonProps
                             }: {
    character: Character;
    selected: boolean;
} & ComponentPropsWithRef<"button">) {
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
            className={`character-tab${selected ? " character-tab--selected" : ""}`}
            {...buttonProps}
        >
            {/* L'URL de l'emblème est passée au CSS via une variable */}
            <span
                className="character-tab__emblem"
                style={
                    {
                        "--emblem-url": `url(${BUNGIE_ROOT}${character.emblemBackgroundPath})`,
                    } as CSSProperties
                }/>
            <span className="character-tab__info">
                {/* Le symbole de classe, devant le nom : l'emblème est un décor
                    que rien n'oblige à décrire la classe qui le porte. */}
                <ClassIcon
                    classType={character.classType}
                    className="character-tab__icon"
                />
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
