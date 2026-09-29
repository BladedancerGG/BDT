import { useId, type SVGProps } from "react";

/**
 * Liseré doré des attributs améliorés, posé par-dessus l'icône du plug.
 *
 * Les `id` sont dérivés de `useId` et non écrits en dur : un `id` de SVG est
 * global au document, et cette icône apparaît autant de fois qu'il y a
 * d'attributs améliorés à l'écran. Deux définitions de même nom, et toutes les
 * instances tirent celle de la première — l'ordre du DOM décide alors du rendu.
 */
export default function EnhancedPerkIcon(props: SVGProps<SVGSVGElement>) {
    const uid = useId();
    const gradientId = `enhanced-gradient-${uid}`;
    const maskId = `enhanced-mask-${uid}`;

    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden focusable="false" {...props}>
            <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop stopColor="#eade8b" offset="50%" stopOpacity="0"/>
                    <stop stopColor="#eade8b" offset="100%" stopOpacity="1"/>
                </linearGradient>
                {/* Le liseré s'arrête au disque du plug : hors de lui, il
                    dépasserait du cadre de la vignette. */}
                <mask id={maskId}>
                    <rect x="0" y="0" width="100" height="100" fill="black"/>
                    <circle cx="50" cy="50" r="46" fill="white"/>
                </mask>
            </defs>
            <rect x="0" y="0" width="100" height="100" fill={`url(#${gradientId})`} mask={`url(#${maskId})`}/>
            <rect x="5" y="0" width="6" height="100" fill="#eade8b" mask={`url(#${maskId})`}/>
            <path d="M5,50 l0,-24 l-6,0 l9,-16 l9,16 l-6,0 l0,24 z" fill="#eade8b"/>
        </svg>
    )
}
