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
import {
  useDefinition,
  type DisplayProperties,
} from "@/lib/manifest/use-definition";
import { ItemTooltip } from "./tooltip/ItemTooltip";
import { BUNGIE_ROOT } from "@/lib/destiny/display";

interface InventoryItemDefinition {
  displayProperties: DisplayProperties;
}

// Icône d'objet avec tooltip riche : survol pour afficher, clic pour épingler.
export function ItemIcon({
  itemHash,
  itemInstanceId,
}: {
  itemHash: number;
  itemInstanceId?: string;
}) {
  const def = useDefinition<InventoryItemDefinition>(
    "DestinyInventoryItemDefinition",
    itemHash,
  );

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

  const icon = def?.displayProperties?.icon;
  const name = def?.displayProperties?.name ?? "";

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
        className={`h-12 w-12 cursor-pointer overflow-hidden rounded border bg-neutral-800 transition ${
          pinned ? "border-amber-500" : "border-neutral-700 hover:border-neutral-500"
        }`}
      >
        {icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${BUNGIE_ROOT}${icon}`}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </div>

      {shown && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50"
          >
            <ItemTooltip
              itemHash={itemHash}
              itemInstanceId={itemInstanceId}
              pinned={pinned}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
