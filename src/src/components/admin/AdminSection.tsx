"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {GroupHeader} from "@/components/GroupHeader";

/**
 * Une section de la page de statistiques : en-tête repliable, filtres,
 * tableau.
 *
 * L'en-tête est celui des groupes du coffre (`GroupHeader`, niveau racine) :
 * même apparence, même chevron, même compteur — « affichées · total » quand
 * des filtres retiennent moins de lignes, comme une recherche dans le coffre.
 *
 * Composant client pour l'état replié ; le tableau, lui, reste rendu par le
 * serveur et arrive en `children`. Cet état n'est pas sauvegardé, mais il
 * survit aux changements de filtre ou de tri : ceux-ci remplacent l'URL sans
 * démonter la page.
 *
 * Le tableau défile horizontalement dans son cadre plutôt que d'élargir la
 * page.
 */
export function AdminSection({
                                 id,
                                 title,
                                 count,
                                 overall,
                                 filters,
                                 note,
                                 empty,
                                 children,
                                 footer,
                             }: {
    id: string;
    title: string;
    /** Lignes affichées, filtres appliqués */
    count: number;
    /** Lignes avant filtrage ; affichées à côté quand elles diffèrent */
    overall?: number;
    /** Bouton et panneau de filtres, posés au-dessus du tableau */
    filters?: React.ReactNode;
    /** Précision affichée sous le titre */
    note?: string;
    /** Texte affiché à la place du tableau quand il n'y a rien */
    empty?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}) {
    const tCommon = useTranslations("common");
    const [collapsed, setCollapsed] = useState(false);
    const filtered = overall !== undefined && overall !== count;

    return (
        <section id={id} className="admin-section" aria-label={title}>
            {/* Le bouton dans un titre : la section reste repérable par la
                navigation aux titres des lecteurs d'écran. */}
            <h2 className="admin-section__heading">
                <GroupHeader
                    kind="root"
                    label={title}
                    count={filtered ? {found: count, total: overall} : {total: count}}
                    collapsed={collapsed}
                    onToggle={() => setCollapsed((c) => !c)}
                    expandLabel={tCommon("expand")}
                    collapseLabel={tCommon("collapse")}
                />
            </h2>
            {!collapsed && (
                <>
                    {note && <p className="admin-section__note">{note}</p>}
                    {filters}
                    {count === 0 && empty ? (
                        <p className="admin-section__empty">{empty}</p>
                    ) : (
                        <div className="admin-section__scroll">
                            <table className="admin-section__table">{children}</table>
                        </div>
                    )}
                    {footer}
                </>
            )}
        </section>
    );
}
