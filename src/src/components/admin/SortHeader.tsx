import {ChevronDownIcon, ChevronUpDownIcon, ChevronUpIcon} from "@heroicons/react/20/solid";
import {Link} from "@/i18n/navigation";
import type {SortDirection} from "@/lib/admin/sort";

/**
 * En-tête de colonne cliquable : aucun tri → croissant → décroissant → aucun.
 *
 * Un simple lien, calculé par la page : le serveur trie (les appels sont
 * paginés en base), il n'y a donc rien à faire côté client que de changer
 * l'URL. `scroll={false}` garde la position, la page se rerendant en entier.
 */
export function SortHeader({
                               label,
                               href,
                               dir,
                               hint,
                               className,
                           }: {
    label: string;
    href: string;
    /** Sens courant de cette colonne, null si elle ne trie pas */
    dir: SortDirection | null;
    /** Ce que fera le prochain clic */
    hint: string;
    className?: string;
}) {
    const Icon = dir === "asc" ? ChevronUpIcon : dir === "desc" ? ChevronDownIcon : ChevronUpDownIcon;
    return (
        <th
            className={className}
            aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
        >
            <Link
                href={href}
                scroll={false}
                replace
                className="admin-section__sort"
                data-active={dir ? "" : undefined}
                title={hint}
            >
                {label}
                <Icon className="admin-section__sort-icon" aria-hidden/>
            </Link>
        </th>
    );
}
