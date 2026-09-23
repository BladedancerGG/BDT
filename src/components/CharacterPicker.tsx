"use client";

import {useRef, useState, type CSSProperties} from "react";
import {useTranslations} from "next-intl";
import {
    useFloating,
    useClick,
    useDismiss,
    useRole,
    useListNavigation,
    useInteractions,
    offset,
    flip,
    shift,
    autoUpdate,
    FloatingPortal,
    FloatingFocusManager,
} from "@floating-ui/react";
import type {Character} from "@/lib/bungie/use-profile";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {ClassIcon} from "./ClassIcon";
import {CharacterTab} from "./CharacterTab";

/**
 * Le personnage regardé, et de quoi en changer.
 *
 * Les trois onglets s'alignaient auparavant dans l'en-tête. Ils y tenaient une
 * largeur d'emblème chacun — la moitié de la barre pour un choix qu'on fait
 * rarement — alors que deux d'entre eux ne font que patienter. Le sélecteur ne
 * montre donc que le personnage courant, et déplie les trois au clic.
 *
 * Le bouton superpose le symbole de classe à l'icône d'emblème : l'emblème seul
 * ne dit pas la classe, et c'est elle qu'on cherche du regard.
 *
 * Le menu passe par Floating UI comme les autres surfaces flottantes de
 * l'application : positionnement, fermeture par Échap ou clic au-dehors, et
 * navigation aux flèches.
 *
 * `full` échange le bouton carré contre l'emblème entier — le même onglet que
 * les options du menu. C'est la forme qu'il prend hors de l'en-tête, où la
 * place manque moins et où rien d'autre n'annonce le personnage regardé (voir
 * la vue des groupes).
 */
export function CharacterPicker({
                                    characters,
                                    selectedId,
                                    onSelect,
                                    full = false,
                                }: {
    characters: readonly Character[];
    selectedId: string | null;
    onSelect: (characterId: string) => void;
    /** Afficher l'emblème entier plutôt que la vignette carrée */
    full?: boolean;
}) {
    const t = useTranslations("inventory");

    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const items = useRef<(HTMLElement | null)[]>([]);

    const {refs, floatingStyles, context} = useFloating({
        open,
        onOpenChange: setOpen,
        placement: "bottom-start",
        middleware: [offset(4), flip(), shift({padding: 8})],
        whileElementsMounted: autoUpdate,
    });

    const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
        useClick(context),
        useDismiss(context, {outsidePressEvent: "mousedown"}),
        useRole(context, {role: "menu"}),
        useListNavigation(context, {
            listRef: items,
            activeIndex,
            onNavigate: setActiveIndex,
            loop: true,
        }),
    ]);

    const current =
        characters.find((c) => c.characterId === selectedId) ?? characters[0];
    if (!current) return null;

    return (
        <div className={`character-picker${full ? " character-picker--full" : ""}`}>
            {full ? (
                <CharacterTab
                    // setReference est un callback ref stable de Floating UI
                    ref={refs.setReference}
                    character={current}
                    // Il n'est pas une option du menu : le liseré de sélection
                    // y désignerait le seul choix affiché.
                    selected={false}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    {...getReferenceProps()}
                />
            ) : (
                <button
                    // setReference est un callback ref stable de Floating UI
                    // (API documentée), pas une lecture de ref pendant le rendu
                    // eslint-disable-next-line react-hooks/refs
                    ref={refs.setReference}
                    type="button"
                    className="character-picker__button"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-label={t("character")}
                    title={t("character")}
                    {...getReferenceProps()}
                >
                    {/* L'icône d'emblème passe au CSS par une variable, comme le
                        fond des onglets dépliés */}
                    <span
                        className="character-picker__emblem"
                        style={
                            {
                                "--emblem-url": `url(${BUNGIE_ROOT}${current.emblemPath})`,
                            } as CSSProperties
                        }
                    />
                    <ClassIcon
                        classType={current.classType}
                        className="character-picker__class"
                    />
                </button>
            )}

            {open && (
                <FloatingPortal>
                    <FloatingFocusManager context={context} modal={false}>
                        <div
                            // eslint-disable-next-line react-hooks/refs
                            ref={refs.setFloating}
                            style={floatingStyles}
                            className="character-picker__menu"
                            {...getFloatingProps()}
                        >
                            {characters.map((character, index) => (
                                <CharacterTab
                                    key={character.characterId}
                                    character={character}
                                    selected={character.characterId === current.characterId}
                                    ref={(node) => {
                                        items.current[index] = node;
                                    }}
                                    role="menuitem"
                                    tabIndex={activeIndex === index ? 0 : -1}
                                    {...getItemProps({
                                        onClick: () => {
                                            onSelect(character.characterId);
                                            setOpen(false);
                                        },
                                    })}
                                />
                            ))}
                        </div>
                    </FloatingFocusManager>
                </FloatingPortal>
            )}
        </div>
    );
}
