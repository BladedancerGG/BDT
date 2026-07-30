"use client";

import { useState } from "react";
import {
  useFloating,
  useHover,
  useDismiss,
  useRole,
  useInteractions,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
  safePolygon,
} from "@floating-ui/react";
import { ItemThumb, type ItemThumbProps } from "./ItemThumb";
import { ItemTooltip } from "./tooltip/ItemTooltip";

// Objet cliquable dans une grille d'inventaire : vignette (icône + habillages)
// et tooltip riche — survol pour afficher, clic pour épingler.
export function ItemIcon({
  itemHash,
  itemInstanceId,
  state,
  versionNumber,
  gearTier,
}: ItemThumbProps & { itemInstanceId?: string }) {
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

  const hover = useHover(context, {
    enabled: !pinned,
    move: false,
    delay: { open: 80, close: 0 },
    handleClose: safePolygon(),
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
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
        className={`item${pinned ? " item--pinned" : ""}`}
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
