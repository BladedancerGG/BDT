import type { SVGProps } from "react";

// Loupe de la recherche. Partagée par la barre elle-même et par le bouton qui
// la déplie sur téléphone (voir SearchToggle) : deux tracés à garder en phase
// n'auraient rien apporté.
export default function SearchIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 16 16" aria-hidden focusable="false" {...props}>
            <circle
                cx="7"
                cy="7"
                r="4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
            />
            <path
                d="M10.5 10.5L14 14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
        </svg>
    );
}
