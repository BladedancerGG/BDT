"use client";

import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from "react";
import {useTranslations} from "next-intl";
import {useVirtualizer} from "@tanstack/react-virtual";
import type {DestinyItemComponent} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import type {GroupIcon, ItemOwner} from "@/lib/destiny/grouping";
import type {ItemCategory} from "@/lib/settings/constants";
import {useGroupedItems} from "@/lib/destiny/use-grouped-items";
import {useGridMetrics} from "@/lib/destiny/use-grid-metrics";
import {matchKey, useSearchFiltered, useSearchMatches} from "@/lib/search/provider";
import {useSettings} from "@/lib/settings/store";
import {ItemIcon} from "./ItemIcon";
import {GroupHeader, type HeaderCount} from "./GroupHeader";

/**
 * Une ligne de la grille virtualisée. Les en-têtes en font partie au même titre
 * que les objets : c'est la seule façon de les faire défiler avec le contenu
 * sans sortir de la virtualisation — et donc sans monter les milliers de
 * vignettes qu'elle sert précisément à éviter.
 */
type GridRow =
    | {
    kind: "root";
    key: string;
    label: string;
    icon?: GroupIcon;
    count: HeaderCount;
    collapsed: boolean;
    height: number;
}
    | {
    kind: "section";
    key: string;
    label: string;
    /** Seuls les personnages de « Autres personnages » en portent une */
    icon?: GroupIcon;
    /** Absent pour ces mêmes personnages : leurs emplacements le portent */
    count?: HeaderCount;
    collapsed: boolean;
    height: number;
}
    | {
    kind: "group";
    key: string;
    label: string;
    icon?: GroupIcon;
    count: HeaderCount;
    collapsed: boolean;
    height: number;
}
    | {
    kind: "items";
    key: string;
    items: DestinyItemComponent[];
    height: number;
};

/**
 * Sous-groupe d'une section de tête : un personnage, quand les objets perdus
 * des trois sont réunis.
 */
export interface LeadGroup {
    key: string;
    label: string;
    icon?: GroupIcon;
    items: DestinyItemComponent[];
    /** Capacité de ce personnage */
    max?: number;
    /** Voir `HeaderCount.alert` */
    alert?: number;
}

/**
 * Section posée avant le coffre, dans le même défilement — en pratique les
 * objets perdus. Ses objets ne sont ni triés ni regroupés : ils sont peu
 * nombreux, et leur ordre est celui du Courrier.
 *
 * `groups` les découpe par personnage, ce que demande la disposition « trois
 * personnages » : les objets perdus y viennent des trois à la fois, et rien
 * dans une vignette ne dit chez qui elle dort. `items` reste la liste
 * complète — c'est elle que filtre la recherche, les sous-groupes n'en
 * retenant ensuite que ce qui a survécu.
 */
export interface LeadSection {
    key: string;
    label: string;
    icon?: GroupIcon;
    items: DestinyItemComponent[];
    groups?: LeadGroup[];
    /**
     * Capacité, quand la section ne vaut que pour un personnage. Découpée par
     * personnage, la limite est celle de chacun et se lit sur `groups`.
     */
    max?: number;
    /** Voir `HeaderCount.alert`, et `max` pour le découpage par personnage */
    alert?: number;
}

/**
 * Un autre personnage que celui affiché, posé dans le stockage de la
 * disposition à un seul personnage : ses objets y sont à portée de glisser,
 * sans changer de personnage pour aller les chercher.
 *
 * Porté et rangé arrivent séparés : chaque emplacement montre d'abord ce que
 * le personnage porte, et une vignette ne dit pas à elle seule si l'objet
 * l'est.
 */
export interface CharacterSection {
    key: string;
    label: string;
    icon?: GroupIcon;
    equipped: DestinyItemComponent[];
    stored: DestinyItemComponent[];
    /**
     * Objets par emplacement, tous types confondus et avant tout filtre de
     * vue : c'est la place réellement prise, que `equipped` et `stored` ne
     * disent plus une fois filtrés.
     */
    occupancy: ReadonlyMap<number, number>;
}

// Référence stable : `useSearchFiltered` mémorise sur l'identité de sa liste
const NO_ITEMS: DestinyItemComponent[] = [];

/** Clé de repli de la section du coffre. Aucun emplacement ne peut la heurter. */
const VAULT_KEY = "root:vault";
/** Clé de repli de la racine « Autres personnages » */
const CHARACTERS_KEY = "root:characters";

/**
 * Grille d'objets virtualisée, pour les listes longues (le coffre en compte
 * environ un millier).
 *
 * Seules les lignes visibles sont montées : le DOM reste petit et les images
 * hors écran ne sont jamais demandées. Les objets étant de taille fixe, on
 * virtualise par **lignes** — le nombre de colonnes est déduit de la largeur
 * disponible (voir useGridMetrics).
 *
 * Le contenu est découpé en sections d'emplacement, elles-mêmes découpées en
 * sous-groupes selon le réglage du joueur (voir `lib/destiny/grouping.ts`).
 * Le tout est coiffé d'un niveau supérieur — objets perdus, puis coffre — qui
 * fait partie de la virtualisation lui aussi : le titre du coffre défile avec
 * son contenu, seule façon de faire cohabiter les deux dans un même ascenseur.
 * Chaque en-tête se replie, mais cet état n'est **pas** mémorisé : le cookie de
 * préférences est plafonné à 4 Ko et partagé, une liste de groupes repliés y
 * grandirait sans limite.
 *
 * Les infobulles ne sont pas rognées par le conteneur de défilement : elles
 * sont rendues dans un portail, en dehors de cet arbre DOM.
 */
export function VirtualItemGrid({
                                    title,
                                    items,
                                    details,
                                    lead,
                                    characters,
                                    category,
                                    owners,
                                    fixedColumns,
                                    fill,
                                    capacities,
                                    capped,
                                }: {
    title: string;
    items: DestinyItemComponent[];
    details: Record<string, ItemDetail>;
    lead?: LeadSection;
    /** Autres personnages, entre la section de tête et le coffre */
    characters?: CharacterSection[];
    /** Famille d'objets à retenir — voir `useDisplayableItems` */
    category?: ItemCategory;
    /**
     * Détenteur de chaque objet, quand la grille en réunit de plusieurs
     * personnages : leurs sections se découpent alors par personnage (voir
     * `GroupingContext.owners`).
     */
    owners?: ReadonlyMap<DestinyItemComponent, ItemOwner>;
    /**
     * Nombre d'objets par ligne imposé, la taille des vignettes s'y ajustant.
     *
     * Sur téléphone : le réglage de taille y est sans objet — la largeur de
     * l'écran ne laisse le choix qu'entre quelques dispositions — et la calculer
     * en CSS depuis `100vw` ratait la barre de défilement (voir
     * `useGridMetrics.fixedColumns`).
     */
    fixedColumns?: number;
    /**
     * Occupation de la racine, tous types confondus : l'onglet ne fait que
     * choisir ce qu'on regarde, pas ce qui prend de la place.
     */
    fill: {total: number; max?: number; alert?: number};
    /** Capacité de chaque emplacement — voir `useBucketCapacities` */
    capacities: ReadonlyMap<number, number>;
    /**
     * Sections dont la capacité s'affiche. Celle d'un emplacement d'origine
     * au coffre ne voudrait rien dire : seul compte le total du coffre.
     * Découpée par personnage, la limite passe sur chacun d'eux.
     */
    capped?: ReadonlySet<number>;
}) {
    const t = useTranslations("inventory");
    const tCommon = useTranslations("common");
    // La recherche s'applique avant le regroupement : les compteurs des
    // sections comptent alors ce qui est réellement affiché.
    const found = useSearchFiltered(items);
    const leadFound = useSearchFiltered(lead?.items ?? NO_ITEMS);
    // Filtrés, triés selon les critères réglés dans les paramètres, puis groupés
    const sections = useGroupedItems(found, details, category, owners);

    // Les objets des autres personnages passent par le MÊME filtrage et le
    // même tri que le coffre, en une seule liste : un appel de hook par
    // personnage n'est pas possible, leur nombre varie. Chaque objet est
    // ensuite rendu à son personnage par identité.
    const characterItems = useMemo(
        () =>
            characters
                ? characters.flatMap((c) => [...c.equipped, ...c.stored])
                : NO_ITEMS,
        [characters],
    );
    const characterFound = useSearchFiltered(characterItems);
    const characterSections = useGroupedItems(characterFound, details, category);
    const charactersLabel = t("otherCharacters");
    // `null` hors recherche : les compteurs n'affichent alors pas de « trouvés »
    const matched = useSearchMatches();
    const viewportRef = useRef<HTMLDivElement>(null);
    // La taille réglée dans les paramètres change la grille sans changer sa
    // largeur : on la passe pour forcer une re-mesure. C'est le réglage dédié au
    // coffre, celui dont --item-size hérite ici (voir inventory.scss).
    const vaultIconSize = useSettings((s) => s.vaultIconSize);
    const {columns, itemSize, rowHeight, rootHeight, sectionHeight, groupHeight} =
        useGridMetrics(viewportRef, vaultIconSize, fixedColumns);

    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const toggle = useCallback((key: string) => {
        setCollapsed((previous) => {
            const next = new Set(previous);
            if (!next.delete(key)) next.add(key);
            return next;
        });
    }, []);

    // Place prise par emplacement, et par personnage pour ceux qu'on découpe
    // ainsi : comptée sur la liste brute, ni filtrée par l'onglet ni par la
    // recherche. L'emplacement du MOMENT, car c'est lui qui est plein.
    const occupancy = useMemo(() => {
        const byBucket = new Map<number, number>();
        const byOwner = new Map<string, number>();
        if (!capped) return {byBucket, byOwner};
        for (const item of items) {
            byBucket.set(item.bucketHash, (byBucket.get(item.bucketHash) ?? 0) + 1);
            const owner = owners?.get(item);
            if (owner) {
                const key = `${item.bucketHash}/owner:${owner.key}`;
                byOwner.set(key, (byOwner.get(key) ?? 0) + 1);
            }
        }
        return {byBucket, byOwner};
    }, [items, owners, capped]);

    const rows = useMemo(() => {
        const out: GridRow[] = [];

        // Ce que la recherche retient d'une liste affichée. Compté sur les
        // correspondances et non sur la liste : le réglage qui estompe au lieu
        // de masquer y laisse les objets écartés.
        const countFound = (list: readonly DestinyItemComponent[]) =>
            matched === null
                ? undefined
                : list.filter((item) =>
                      matched.has(matchKey(item.itemHash, item.itemInstanceId)),
                  ).length;

        // Découpe une liste en lignes de `columns` objets
        const pushItems = (
            prefix: string,
            list: DestinyItemComponent[],
            into: GridRow[] = out,
        ) => {
            for (let start = 0; start < list.length; start += columns) {
                into.push({
                    kind: "items",
                    key: `${prefix}#${start}`,
                    items: list.slice(start, start + columns),
                    height: rowHeight,
                });
            }
        };

        // Les objets perdus, avant le coffre et au même rang que lui. Absents
        // quand la recherche n'en retient aucun : une section vide n'apprend rien.
        if (lead && leadFound.length > 0) {
            const leadCollapsed = collapsed.has(lead.key);
            out.push({
                kind: "root",
                key: lead.key,
                label: lead.label,
                icon: lead.icon,
                count: {
                    total: lead.items.length,
                    found: countFound(leadFound),
                    max: lead.max,
                    alert: lead.alert,
                },
                collapsed: leadCollapsed,
                height: rootHeight,
            });
            if (!leadCollapsed) {
                if (lead.groups) {
                    // Le filtre de recherche a déjà été appliqué à la liste
                    // complète : les sous-groupes s'y ramènent par identité,
                    // plutôt que de relancer un filtrage par personnage — ce
                    // qui demanderait autant de hooks que de personnages.
                    const kept = new Set(leadFound);
                    for (const group of lead.groups) {
                        const items = group.items.filter((item) => kept.has(item));
                        // Un personnage sans rien au Courrier n'a pas de ligne :
                        // trois en-têtes vides ne diraient que du vide.
                        if (items.length === 0) continue;
                        const groupKey = `${lead.key}/${group.key}`;
                        const groupCollapsed = collapsed.has(groupKey);
                        out.push({
                            kind: "group",
                            key: groupKey,
                            label: group.label,
                            icon: group.icon,
                            count: {
                                total: group.items.length,
                                found: countFound(items),
                                max: group.max,
                                alert: group.alert,
                            },
                            collapsed: groupCollapsed,
                            height: groupHeight,
                        });
                        if (!groupCollapsed) pushItems(groupKey, items);
                    }
                } else {
                    pushItems(lead.key, leadFound);
                }
            }
        }

        // Les autres personnages, réunis sous une seule racine : un personnage
        // au niveau d'une section, ses emplacements à celui d'un sous-groupe.
        // Ceux du coffre n'y trouvent pas place — ils éloigneraient l'objet
        // porté de la tête de son emplacement, où il doit se lire en premier.
        // Les lignes sont préparées à part : la racine annonce le total, qui
        // n'est connu qu'une fois tous les personnages parcourus.
        const characterRows: GridRow[] = [];
        // Le total de la racine compte tous les personnages, même celui dont
        // la recherche n'a rien retenu : c'est leur occupation, pas un résultat.
        let characterTotal = 0;
        for (const character of characters ?? []) {
            for (const n of character.occupancy.values()) characterTotal += n;
        }
        let shownCharacters = 0;
        const characterShown: DestinyItemComponent[] = [];
        for (const character of characters ?? []) {
            const equipped = new Set(character.equipped);
            const owned = new Set([...character.equipped, ...character.stored]);
            const buckets = characterSections
                .map((section) => {
                    const mine = section.groups
                        .flatMap((group) => group.items)
                        .filter((item) => owned.has(item));
                    return {
                        section,
                        items: [
                            ...mine.filter((item) => equipped.has(item)),
                            ...mine.filter((item) => !equipped.has(item)),
                        ],
                    };
                })
                .filter(({items}) => items.length > 0);
            // Rien de ce personnage ne survit à la recherche : pas d'en-tête
            if (buckets.length === 0) continue;

            shownCharacters++;

            const characterKey = `${CHARACTERS_KEY}/${character.key}`;
            const characterCollapsed = collapsed.has(characterKey);
            characterRows.push({
                kind: "section",
                key: characterKey,
                label: character.label,
                icon: character.icon,
                collapsed: characterCollapsed,
                height: sectionHeight,
            });
            for (const {items} of buckets) characterShown.push(...items);
            if (characterCollapsed) continue;

            for (const {section, items} of buckets) {
                const bucketKey = `${characterKey}/${section.key}`;
                const bucketCollapsed = collapsed.has(bucketKey);
                characterRows.push({
                    kind: "group",
                    key: bucketKey,
                    label: section.label,
                    count: {
                        total:
                            character.occupancy.get(section.bucketHash) ??
                            items.length,
                        found: countFound(items),
                        max: capacities.get(section.bucketHash),
                    },
                    collapsed: bucketCollapsed,
                    height: groupHeight,
                });
                if (!bucketCollapsed) pushItems(bucketKey, items, characterRows);
            }
        }
        if (shownCharacters > 0) {
            const charactersCollapsed = collapsed.has(CHARACTERS_KEY);
            out.push({
                kind: "root",
                key: CHARACTERS_KEY,
                label: charactersLabel,
                count: {total: characterTotal, found: countFound(characterShown)},
                collapsed: charactersCollapsed,
                height: rootHeight,
            });
            if (!charactersCollapsed) out.push(...characterRows);
        }

        const vaultCollapsed = collapsed.has(VAULT_KEY);
        out.push({
            kind: "root",
            key: VAULT_KEY,
            label: title,
            icon: {kind: "vault"},
            count: {
                total: fill.total,
                found: countFound(
                    sections.flatMap((s) => s.groups.flatMap((g) => g.items)),
                ),
                max: fill.max,
                alert: fill.alert,
            },
            collapsed: vaultCollapsed,
            height: rootHeight,
        });
        if (vaultCollapsed) return out;

        for (const section of sections) {
            const sectionCollapsed = collapsed.has(section.key);
            const capacity = capped?.has(section.bucketHash)
                ? capacities.get(section.bucketHash)
                : undefined;
            // Découpée par personnage, la section n'a pas de limite à elle :
            // chacun a la sienne.
            const perOwner = section.groups.some((g) => g.key.startsWith("owner:"));
            out.push({
                kind: "section",
                key: section.key,
                label: section.label,
                count: capped?.has(section.bucketHash)
                    ? {
                          total:
                              occupancy.byBucket.get(section.bucketHash) ??
                              section.count,
                          found: countFound(
                              section.groups.flatMap((g) => g.items),
                          ),
                          max: perOwner ? undefined : capacity,
                      }
                    : {total: section.count},
                collapsed: sectionCollapsed,
                height: sectionHeight,
            });
            if (sectionCollapsed) continue;

            for (const group of section.groups) {
                // Clé préfixée par la section : un même sous-groupe (« Titans »)
                // apparaît dans plusieurs emplacements, et chacun se replie
                // indépendamment.
                const groupKey = `${section.key}/${group.key}`;
                const groupCollapsed = section.grouped && collapsed.has(groupKey);

                if (section.grouped) {
                    out.push({
                        kind: "group",
                        key: groupKey,
                        label: group.label,
                        icon: group.icon,
                        count:
                            perOwner && capacity !== undefined
                                ? {
                                      total:
                                          occupancy.byOwner.get(
                                              `${section.bucketHash}/${group.key}`,
                                          ) ?? group.items.length,
                                      found: countFound(group.items),
                                      max: capacity,
                                  }
                                : {total: group.items.length},
                        collapsed: groupCollapsed,
                        height: groupHeight,
                    });
                }
                if (groupCollapsed) continue;

                pushItems(groupKey, group.items);
            }
        }

        return out;
    }, [
        sections,
        lead,
        leadFound,
        characters,
        characterSections,
        charactersLabel,
        title,
        fill,
        capacities,
        capped,
        occupancy,
        matched,
        collapsed,
        columns,
        rowHeight,
        rootHeight,
        sectionHeight,
        groupHeight,
    ]);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => viewportRef.current,
        estimateSize: (index) => rows[index].height,
        // Une clé stable plutôt que l'indice : replier un groupe décale toutes
        // les lignes qui suivent, et le cache des tailles suivrait sinon le
        // mauvais contenu.
        getItemKey: (index) => rows[index].key,
        // Quelques lignes de marge pour que le défilement reste fluide
        overscan: 3,
    });

    // Les hauteurs ne sont jamais mesurées dans le DOM, seulement estimées :
    // il faut donc vider le cache dès que la composition des lignes change.
    useEffect(() => {
        virtualizer.measure();
    }, [virtualizer, rows]);

    return (
        // --fill : occupe la hauteur restante, pour être le seul élément à défiler
        <section
            className="item-grid"
            // La taille mesurée descend par la même variable que le réglage :
            // tout le sous-arbre la lit déjà, vignettes comme habillages.
            style={
                itemSize
                    ? ({"--item-size": `${itemSize}px`} as CSSProperties)
                    : undefined
            }
        >
            <div ref={viewportRef} className="item-grid__viewport">
                <div
                    className="item-grid__canvas"
                    style={{height: virtualizer.getTotalSize()}}
                >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                        const row = rows[virtualRow.index];
                        if (!row) return null;

                        const style: CSSProperties = {
                            height: row.height,
                            transform: `translateY(${virtualRow.start}px)`,
                        };

                        if (row.kind === "items") {
                            return (
                                <div key={virtualRow.key} className="item-grid__row" style={style}>
                                    {row.items.map((item, i) => {
                                        const detail = item.itemInstanceId
                                            ? details[item.itemInstanceId]
                                            : undefined;
                                        return (
                                            <ItemIcon
                                                key={item.itemInstanceId ?? `${item.itemHash}-${i}`}
                                                itemHash={item.itemHash}
                                                itemInstanceId={item.itemInstanceId}
                                                state={item.state}
                                                versionNumber={item.versionNumber}
                                                gearTier={detail?.instance?.gearTier}
                                                quantity={item.quantity}
                                                bucketHash={item.bucketHash}
                                            />
                                        );
                                    })}
                                </div>
                            );
                        }

                        return (
                            <GroupHeader
                                key={virtualRow.key}
                                kind={row.kind}
                                label={row.label}
                                count={row.count}
                                icon={row.icon}
                                collapsed={row.collapsed}
                                onToggle={() => toggle(row.key)}
                                expandLabel={tCommon("expand")}
                                collapseLabel={tCommon("collapse")}
                                style={style}
                                virtual
                            />
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
