"use client";

import {
    Children,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

/**
 * Rail horizontal de la vue d'inventaire sur téléphone : une page par
 * personnage, le coffre en dernière, une seule visible à la fois.
 *
 * —— Le défilement boucle, sans rien cloner ni déplacer ————————
 *
 * Un carrousel sans fin se fait d'ordinaire en dupliquant ses pages aux deux
 * bouts. Impossible ici : le coffre est une grille virtualisée d'un millier
 * d'objets, et un second exemplaire coûterait autant que le premier. Déplacer
 * les nœuds dans le DOM ne vaut pas mieux — React remonterait la grille, qui
 * perdrait son défilement et remesurerait tout.
 *
 * Seules les valeurs de `order` changent donc. Les pages restent où elles sont
 * dans le document, dans leur ordre d'origine ; c'est la mise en page qui les
 * réarrange. Après chaque geste, la page regardée est ramenée à la DEUXIÈME
 * place et le défilement replacé sur elle : il reste ainsi toujours une page
 * derrière et deux devant, dans quelque sens qu'on aille. La correction est
 * invisible — même page à l'écran, même pixel — parce que les deux se font dans
 * la même image.
 *
 * Elle n'a lieu qu'une fois le geste **terminé** : recaler le défilement
 * pendant l'inertie la casse net, sur iOS en particulier.
 *
 * —— Le pas, et non la largeur ————————————————————————————————
 *
 * D'une page à la suivante il y a sa largeur, PLUS la gouttière du rail. Les
 * deux ont longtemps été confondues ici, la gouttière étant nulle : le pas
 * valait la largeur du rail. Une gouttière de 2 rem ajoutée au CSS a suffi à
 * désaccorder le calcul — le défilement tombait à 360 px là où le code
 * attendait 328, la position ne ressemblait plus à un nombre entier de pages,
 * et la rotation ne se déclenchait plus. Le rail s'arrêtait alors au bout,
 * comme n'importe quel rail.
 *
 * Le pas est donc MESURÉ, et d'une façon qui ne dépend ni de la gouttière ni de
 * l'ordre des pages : la course totale du défilement, divisée par le nombre
 * d'intervalles.
 */
/**
 * Distance d'une page à la suivante, gouttière comprise.
 *
 * Déduite de la course du défilement plutôt que lue sur une page : elle ne
 * dépend alors ni de la valeur de la gouttière, ni de l'ordre où la rotation a
 * rangé les pages.
 */
function pageStride(rail: HTMLElement, count: number): number {
    if (count < 2) return rail.clientWidth;
    return (rail.scrollWidth - rail.clientWidth) / (count - 1);
}

export function InventoryRail({
                                  children,
                                  onPageChange,
                              }: {
    children: ReactNode;
    /**
     * La page regardée a changé — c'est son INDEX dans les enfants, l'ordre du
     * document ne bougeant jamais. Les zones de dépôt s'en servent : sur
     * téléphone, elles ne peuvent viser que le personnage sous les yeux, le
     * rail ne défilant pas pendant un geste.
     */
    onPageChange?: (index: number) => void;
}) {
    const count = Children.count(children);
    // En deçà de trois pages, il n'y a pas de quoi boucler : on ne peut pas
    // avoir à la fois une page devant et une derrière. Le rail reste alors un
    // rail ordinaire, d'un bout à l'autre.
    const loops = count >= 3;

    const railRef = useRef<HTMLDivElement>(null);
    const [current, setCurrent] = useState(0);

    // Le défilement revient sur la deuxième page à chaque rotation. Dans un
    // effet de mise en page, donc avant peinture : sinon l'image intermédiaire
    // — celle où les pages ont tourné mais pas le défilement — s'afficherait.
    useLayoutEffect(() => {
        const rail = railRef.current;
        if (!rail || !loops) return;
        rail.scrollLeft = pageStride(rail, count);
    }, [current, loops, count]);

    useEffect(() => {
        onPageChange?.(current);
    }, [current, onPageChange]);

    useEffect(() => {
        const rail = railRef.current;
        if (!rail || !loops) return;

        let timer = 0;
        const settle = () => {
            const stride = pageStride(rail, count);
            if (!stride) return;
            const page = Math.round(rail.scrollLeft / stride);
            // Le geste n'est pas fini de s'accrocher : rien à décider encore.
            // La tolérance est en pixels et non en fraction de page — deux
            // pixels, de quoi absorber les arrondis d'un pas fractionnaire.
            if (Math.abs(rail.scrollLeft - page * stride) > 2) return;
            if (page === 1) return;
            setCurrent((c) => (c + page - 1 + count) % count);
        };

        // Le navigateur n'annonce pas la fin d'un défilement partout de la même
        // façon (`scrollend` manque encore à l'appel sur plusieurs moteurs) :
        // c'est le silence qui la signale.
        const onScroll = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(settle, 120);
        };

        rail.addEventListener("scroll", onScroll, {passive: true});
        return () => {
            window.clearTimeout(timer);
            rail.removeEventListener("scroll", onScroll);
        };
    }, [loops, count]);

    return (
        <div className="inventory-rail" ref={railRef}>
            {Children.map(children, (child, index) => (
                <div
                    className="inventory-rail__page"
                    // La page courante en deuxième, les autres à la suite, en
                    // cycle. Hors boucle, l'ordre du document suffit.
                    style={{
                        order: loops
                            ? (index - current + 1 + count) % count
                            : index,
                    }}
                >
                    {child}
                </div>
            ))}
        </div>
    );
}
