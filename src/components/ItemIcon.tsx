"use client";

import { useState } from "react";
import {
  useFloating,
  useHover,
  useDismiss,
  useRole,
  useClientPoint,
  useInteractions,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
} from "@floating-ui/react";
import { useSharedDefinition } from "@/lib/destiny/item-defs";
import { subclassKind } from "@/lib/destiny/subclass";
import { ItemThumb, type ItemThumbProps } from "./ItemThumb";
import { ItemTooltip } from "./tooltip/ItemTooltip";

/** Forme de la vignette : les doctrines ne sont pas carrées. */
const SHAPE_CLASS = {
  elemental: "item--shape-diamond",
  prismatic: "item--shape-circle",
} as const;

// Objet cliquable dans une grille d'inventaire : vignette (icône + habillages)
// et tooltip riche — survol pour afficher, clic pour épingler.
export function ItemIcon({
  itemHash,
  itemInstanceId,
  state,
  versionNumber,
  gearTier,
}: ItemThumbProps & { itemInstanceId?: string }) {
  const def = useSharedDefinition(itemHash);
  const shape = subclassKind(def);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const shown = open || pinned;

  const { refs, floatingStyles, context } = useFloating({
    open: shown,
    onOpenChange: (o) => {
      setOpen(o);
      if (!o) setPinned(false); // fermeture (clic extérieur / Échap) → dépingle
    },
    placement: "right-start",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  // Au survol, l'infobulle suit le curseur ; une fois épinglée elle s'ancre à
  // la vignette, pour qu'on puisse aller survoler ses attributs sans la faire
  // fuir. `useClientPoint` désactivé rend l'ancrage à l'élément de référence.
  const clientPoint = useClientPoint(context, { enabled: !pinned });

  const hover = useHover(context, {
    enabled: !pinned,
    // `move: true` : le suivi du curseur exige les événements de déplacement
    move: true,
    delay: { open: 80, close: 0 },
    // Pas de safePolygon : tant qu'elle suit le curseur, l'infobulle ne peut
    // pas être survolée — le chemin protégé n'aurait aucun sens.
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    clientPoint,
    hover,
    dismiss,
    role,
  ]);

  return (
    <>
      <div
        ref={refs.setReference}
        {...getReferenceProps({
          onClick: () => {
            // pinned pilote alors l'affichage ; on remet open à false pour que
            // le clic de dépinglage referme bien le tooltip
            setPinned((p) => !p);
            setOpen(false);
          },
        })}
        className={[
          "item",
          shape ? SHAPE_CLASS[shape] : null,
          pinned ? "item--pinned" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <ItemThumb
          itemHash={itemHash}
          itemInstanceId={itemInstanceId}
          state={state}
          versionNumber={versionNumber}
          gearTier={gearTier}
        />
      </div>

      {shown && (
        <FloatingPortal>
          <div
            // setFloating est un callback ref stable fourni par Floating UI
            // (API documentée), pas une lecture de ref pendant le rendu.
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="floating-layer"
          >
            <ItemTooltip
              itemHash={itemHash}
              itemInstanceId={itemInstanceId}
              state={state}
              versionNumber={versionNumber}
              gearTier={gearTier}
              pinned={pinned}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
