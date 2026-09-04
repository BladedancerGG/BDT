"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {
    useFloating,
    useDismiss,
    useInteractions,
    offset,
    flip,
    shift,
    autoUpdate,
    FloatingPortal,
} from "@floating-ui/react";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {
    useLoadoutIdentifierChoices,
    useLoadoutIdentifiers,
    type LoadoutIdentifierHashes,
} from "@/lib/loadouts/use-loadout-identifiers";
import {
    IdentifierPicker,
    type IdentifierTarget,
} from "@/components/loadouts/IdentifierPicker";

/**
 * L'apparence d'un emplacement de **groupe** : sa couleur, son glyphe, son nom.
 *
 * Le pendant de `LoadoutTitle` pour un instantané, et volontairement bien plus
 * court. Celui-ci porte tout l'appareil d'un envoi vers Bungie — brouillon,
 * mise en file, attente d'aboutissement, réessai — parce que
 * `UpdateLoadoutIdentifiers` écrit les trois valeurs d'un bloc et peut échouer.
 * Ici rien ne part : le choix va dans le stockage local, et **s'applique au
 * clic**. Il n'y a donc ni brouillon à rassembler, ni refus à afficher.
 *
 * La grille de choix, elle, est la même — `IdentifierPicker`, sorti de
 * `LoadoutTitle` pour être partagé.
 *
 * Un emplacement rempli à la main recevait jusqu'ici les premiers choix du jeu
 * et les gardait : tous se ressemblaient. C'est ce que ce composant corrige.
 */
export function GroupSlotIdentifiers({
                                         identifiers,
                                         slotNumber,
                                         onChange,
                                     }: {
    /** Les trois hashes de l'emplacement, tels qu'ils sont enregistrés */
    identifiers: LoadoutIdentifierHashes;
    /** Place dans le groupe, à partir de 1 */
    slotNumber: number;
    onChange: (next: LoadoutIdentifierHashes) => void;
}) {
    const t = useTranslations("loadouts");
    const tGroups = useTranslations("groups");
    const choices = useLoadoutIdentifierChoices();
    const [target, setTarget] = useState<IdentifierTarget | null>(null);

    // Une seule lecture groupée pour les trois : le même hook que les vignettes
    // des grilles, à qui l'on ne donne ici qu'un emplacement.
    const resolved = useLoadoutIdentifiers([identifiers]);
    const color = resolved.colors.get(identifiers.colorHash);
    const icon = resolved.icons.get(identifiers.iconHash);

    const {refs, floatingStyles, context} = useFloating({
        open: target !== null,
        onOpenChange: (open) => !open && setTarget(null),
        placement: "bottom-start",
        middleware: [offset(8), flip(), shift({padding: 8})],
        whileElementsMounted: autoUpdate,
    });

    // Clic extérieur et Échap referment la grille, seule façon d'en sortir sans
    // choisir — comme pour le titre d'un emplacement du jeu.
    const dismiss = useDismiss(context);
    const {getFloatingProps} = useInteractions([dismiss]);

    /** Applique un choix : les deux autres valeurs partent inchangées. */
    const pick = (next: Partial<LoadoutIdentifierHashes>) => {
        onChange({...identifiers, ...next});
        setTarget(null);
    };

    return (
        <div
            className="group-identifiers"
            // setReference est un callback ref stable de Floating UI, pas une
            // lecture de ref pendant le rendu.
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setReference}
        >
            <span className="group-identifiers__number">{slotNumber}</span>

            <button
                type="button"
                className="group-identifiers__swatch"
                aria-label={t("pickColor")}
                title={t("pickColor")}
                aria-pressed={target === "color"}
                onClick={() => setTarget(target === "color" ? null : "color")}
            >
                {color && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${BUNGIE_ROOT}${color}`} alt="" />
                )}
            </button>

            <button
                type="button"
                className="group-identifiers__swatch group-identifiers__swatch--icon"
                aria-label={t("pickIcon")}
                title={t("pickIcon")}
                aria-pressed={target === "icon"}
                onClick={() => setTarget(target === "icon" ? null : "icon")}
            >
                {icon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${BUNGIE_ROOT}${icon}`} alt="" />
                )}
            </button>

            {/* Le nom vient d'une liste fermée du jeu : un `<select>` dit cela
                mieux qu'une grille, et c'est déjà le choix fait pour un
                emplacement du personnage. */}
            <select
                className="group-identifiers__name"
                value={identifiers.nameHash}
                aria-label={t("pickName")}
                onChange={(event) => pick({nameHash: Number(event.target.value)})}
            >
                {/* Le nom enregistré peut ne pas figurer dans les choix lus —
                    manifeste pas encore prêt : sans cette option, le `select`
                    afficherait un autre nom que celui qui est en place. */}
                {!choices.names.some((c) => c.hash === identifiers.nameHash) && (
                    <option value={identifiers.nameHash}>
                        {resolved.names.get(identifiers.nameHash) ??
                            tGroups("slotTitle", {number: slotNumber})}
                    </option>
                )}
                {choices.names.map((choice) => (
                    <option key={choice.hash} value={choice.hash}>
                        {choice.value}
                    </option>
                ))}
            </select>

            {target && (
                <FloatingPortal>
                    <div
                        // setFloating est un callback ref stable de Floating UI
                        // eslint-disable-next-line react-hooks/refs
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps()}
                        className="floating-layer"
                    >
                        <IdentifierPicker
                            choices={
                                target === "color" ? choices.colors : choices.icons
                            }
                            current={
                                target === "color"
                                    ? identifiers.colorHash
                                    : identifiers.iconHash
                            }
                            kind={target}
                            onPick={(hash) =>
                                pick(
                                    target === "color"
                                        ? {colorHash: hash}
                                        : {iconHash: hash},
                                )
                            }
                        />
                    </div>
                </FloatingPortal>
            )}
        </div>
    );
}
