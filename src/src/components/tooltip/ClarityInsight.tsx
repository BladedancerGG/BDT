"use client";

import type {ReactNode} from "react";
import {useTranslations} from "next-intl";
import {useLiveQuery} from "dexie-react-hooks";
import {tableRows} from "@/lib/manifest/db";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import type {BreakerTypeDefinition, DamageTypeDefinition} from "@/lib/destiny/types";
import {clarityNotes, type ClarityBlock, type ClaritySegment} from "@/lib/clarity/format";
import {AmmoIcon} from "@/components/icons";
import {ClassIcon} from "@/components/ClassIcon";

// Classes de Clarity rendues en icône (segment sans texte), et la valeur
// d'énumération qui la désigne. Valeurs relevées dans le manifeste
// (`enumValue` de DestinyDamageTypeDefinition et DestinyBreakerTypeDefinition),
// pas dans la documentation.
const DAMAGE_TYPES: Record<string, number> = {
    kinetic: 1,
    arc: 2,
    solar: 3,
    void: 4,
    stasis: 6,
    strand: 7,
};
const BREAKER_TYPES: Record<string, number> = {
    barrier: 1, // Perce-bouclier
    overload: 2, // Perturbation
    unstoppable: 3, // Étourdissement
};
const AMMO_TYPES: Record<string, number> = {primary: 1, special: 2, heavy: 3};
const CLASS_TYPES: Record<string, number> = {titan: 0, hunter: 1, warlock: 2};

/**
 * Classes de mise en forme reprises telles quelles en modificateurs BEM. Une
 * liste fermée : le fichier vient d'un tiers, et une classe inconnue n'a pas à
 * atterrir dans le DOM.
 */
const STYLES = new Set(["pve", "pvp", "bold", "yellow", "blue", "green", "purple", "enhancedArrow"]);

function modifiers(base: string, classes: readonly string[] | undefined): string {
    let out = base;
    for (const name of classes ?? []) {
        if (STYLES.has(name)) out += ` ${base}--${name}`;
    }
    return out;
}

/** Icônes d'éléments et d'anti-champions, lues une fois pour tout le bloc. */
interface Icons {
    damage: Map<number, string>;
    breaker: Map<number, string>;
}

function useIcons(): Icons | undefined {
    return useLiveQuery(async () => {
        const [damage, breaker] = await Promise.all([
            tableRows("DestinyDamageTypeDefinition"),
            tableRows("DestinyBreakerTypeDefinition"),
        ]);
        const byEnum = (rows: {data: unknown}[]) => {
            const map = new Map<number, string>();
            for (const row of rows) {
                const def = row.data as DamageTypeDefinition | BreakerTypeDefinition;
                const icon = def.displayProperties?.icon;
                if (def.enumValue && icon) map.set(def.enumValue, icon);
            }
            return map;
        };
        return {damage: byEnum(damage), breaker: byEnum(breaker)};
    }, []);
}

/** Segment sans texte : l'icône que désigne sa classe. */
function SegmentIcon({classes, icons}: {classes: readonly string[]; icons: Icons | undefined}) {
    for (const name of classes) {
        if (name in DAMAGE_TYPES || name in BREAKER_TYPES) {
            const icon =
                name in DAMAGE_TYPES
                    ? icons?.damage.get(DAMAGE_TYPES[name])
                    : icons?.breaker.get(BREAKER_TYPES[name]);
            if (!icon) return null;
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={`${BUNGIE_ROOT}${icon}`} alt="" className="clarity__icon"/>;
        }
        if (name in AMMO_TYPES) {
            return <AmmoIcon ammoType={AMMO_TYPES[name]} className="clarity__icon" aria-hidden/>;
        }
        if (name in CLASS_TYPES) {
            return <ClassIcon classType={CLASS_TYPES[name]} className="clarity__icon"/>;
        }
    }
    return null;
}

function Segment({
    segment,
    icons,
    note,
}: {
    segment: ClaritySegment;
    icons: Icons | undefined;
    note?: number;
}) {
    if (!segment.text) {
        return segment.classNames ? <SegmentIcon classes={segment.classNames} icons={icons}/> : null;
    }
    const className = modifiers("clarity__text", segment.classNames);

    if (segment.link) {
        // Inaccessible à la souris (l'infobulle se ferme en quittant l'icône),
        // mais un appui le suit sur écran tactile.
        return (
            <a
                href={segment.link}
                target="_blank"
                rel="noreferrer noopener"
                className={`${className} clarity__text--link`}
            >
                {segment.text}
            </a>
        );
    }
    if (note !== undefined) {
        return (
            <span className={`${className} clarity__text--term`}>
                {segment.text}
                <sup className="clarity__note-ref">{note}</sup>
            </span>
        );
    }
    return <span className={className}>{segment.text}</span>;
}

function Blocks({
    blocks,
    icons,
    notes,
}: {
    blocks: readonly ClarityBlock[];
    icons: Icons | undefined;
    notes?: Map<ClaritySegment, number>;
}): ReactNode {
    return blocks.map((block, index) =>
        block.linesContent ? (
            <p key={index} className={modifiers("clarity__line", block.classNames)}>
                {block.linesContent.map((segment, i) => (
                    <Segment key={i} segment={segment} icons={icons} note={notes?.get(segment)}/>
                ))}
            </p>
        ) : (
            // Séparateur (`spacer`) : un blanc entre deux paragraphes.
            <div key={index} className="clarity__spacer"/>
        ),
    );
}

/**
 * Bloc « Informations de la communauté » d'une infobulle de plug : la
 * description de Clarity, en anglais — seule langue publiée.
 *
 * L'origine doit se lire au premier coup d'œil (conditions de Clarity) : un
 * intitulé à part, un filet, et le crédit complet dans « À propos ».
 *
 * Les explications de termes (`title`) passent en notes numérotées sous le
 * texte, faute de pouvoir survoler le terme — voir `clarityNotes`.
 */
export function ClarityInsight({blocks}: {blocks: readonly ClarityBlock[]}) {
    const t = useTranslations("item");
    const icons = useIcons();
    const notes = clarityNotes(blocks);

    return (
        <section className="clarity">
            <h3 className="clarity__heading">
                <span>{t("communityInsights")}</span>
            </h3>
            {/* L'intitulé suit la langue de l'interface, le texte reste anglais */}
            <div className="clarity__body" lang="en">
                <Blocks blocks={blocks} icons={icons} notes={notes}/>
            </div>
            {notes.size > 0 && (
                <ol className="clarity__notes" lang="en">
                    {[...notes].map(([segment, number]) => (
                        <li key={number} className="clarity__note">
                            <sup className="clarity__note-ref">{number}</sup>
                            <span className="clarity__note-term">{segment.text}</span>
                            {segment.title && <Blocks blocks={segment.title} icons={icons}/>}
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
