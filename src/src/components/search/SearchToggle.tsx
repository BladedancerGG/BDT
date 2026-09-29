"use client";

import {useTranslations} from "next-intl";
import {useSearchStore} from "@/lib/search/store";
import {useHydrated} from "@/lib/search/use-hydrated";
import {SearchIcon} from "@/components/icons";

/**
 * Loupe de l'en-tête sur téléphone : elle déplie la barre de recherche, qui y
 * est repliée faute de place — le champ réclame toute la largeur, et les quatre
 * autres blocs de la barre ne lui en laissent pas.
 *
 * Le bouton se marque quand une requête est en cours. Sans cela, un filtre posé
 * puis replié deviendrait invisible : le coffre cacherait des objets (réglage
 * « masquer », voir SEARCH_MISS_MODES) sans que rien à l'écran ne dise pourquoi.
 *
 * Le repli lui-même est affaire de CSS (layout/header.scss) : au-delà du seuil,
 * ce bouton n'est pas affiché et la barre est toujours là.
 */
export function SearchToggle({
                                 open,
                                 onToggle,
                             }: {
    open: boolean;
    onToggle: () => void;
}) {
    const t = useTranslations("search");
    const query = useSearchStore((s) => s.query);
    // La requête est relue dans le stockage du navigateur : le serveur ne peut
    // pas la connaître, et le premier rendu du client doit lui rester identique.
    const mounted = useHydrated();
    const filtering = mounted && query !== "";

    return (
        <button
            type="button"
            className={`btn btn--small search-toggle${
                filtering ? " search-toggle--active" : ""
            }`}
            aria-expanded={open}
            aria-controls="header-search"
            aria-label={t("label")}
            title={t("label")}
            onClick={onToggle}
        >
            <SearchIcon/>
        </button>
    );
}
