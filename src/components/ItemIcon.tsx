"use client";

import { useCallback, useState } from "react";
import {
  useFloating,
  useDismiss,
  useRole,
  useInteractions,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
} from "@floating-ui/react";
import { useDraggable } from "@dnd-kit/core";
import { useSharedDefinition } from "@/lib/destiny/item-defs";
import { useSearchMiss } from "@/lib/search/provider";
import { useItemBusy } from "@/lib/actions/store";
import { subclassKind } from "@/lib/destiny/subclass";
import { useMoveActions, type DraggedItem } from "./dnd/MoveDnd";
import { ItemThumb, type ItemThumbProps } from "./ItemThumb";
import { ItemTooltip } from "./tooltip/ItemTooltip";

/** Forme de la vignette : les doctrines ne sont pas carrées. */
const SHAPE_CLASS = {
  elemental: "item--shape-diamond",
  prismatic: "item--shape-circle",
} as const;

// Objet d'une grille d'inventaire : vignette (icône + habillages) et infobulle.
//
// L'infobulle s'ouvre au **clic**, pas au survol, et s'ancre à la vignette. Une
// infobulle qui suivait le curseur se retrouvait sous lui : c'est elle qui
// recevait le `pointerdown`, et l'objet ne partait jamais en glisser-déposer.
// Ancrée et volontaire, elle est aussi pleinement interactive — on peut aller
// survoler ses attributs sans la faire fuir.
//
// La vignette est par ailleurs la poignée de déplacement : glisser vers une
// zone de dépôt met le déplacement en file, double-cliquer équipe sur le
// personnage affiché.
export function ItemIcon({
  itemHash,
  itemInstanceId,
  state,
  versionNumber,
  gearTier,
  equipped,
}: ItemThumbProps & { itemInstanceId?: string }) {
  const def = useSharedDefinition(itemHash);
  const shape = subclassKind(def);
  const [open, setOpen] = useState(false);

  // Écarté par la recherche : la vignette pâlit. Les objets équipés et ceux de
  // l'inventaire d'un personnage ne disparaissent jamais — seuls le coffre et
  // les objets perdus peuvent être filtrés, et cela se décide plus haut.
  const searchMiss = useSearchMiss(itemHash, itemInstanceId);

  // Déplacement en attente de Bungie : la vignette est grisée le temps de la
  // réponse. Le cache local n'est rejoué qu'une fois l'étape acquittée, donc
  // l'objet reste visuellement à son ancienne place jusque-là — sans ce
  // retour, rien ne distinguerait un ordre parti d'un ordre ignoré.
  const busy = useItemBusy(itemInstanceId);

  // Seules les actions transitent par le contexte : l'objet en cours de
  // déplacement en est volontairement absent, il re-rendrait toutes les
  // vignettes montées à chaque saisie.
  const { equipOnSelected } = useMoveActions();

  // L'objet tel qu'il part en déplacement — par glisser-déposer comme par
  // double-clic. Les habillages en font partie : les vignettes du DragOverlay
  // et du panneau d'actions sont montées hors de la grille et ne peuvent pas
  // les retrouver seules.
  const dragged: DraggedItem | undefined = itemInstanceId
    ? { itemInstanceId, itemHash, state, versionNumber, gearTier }
    : undefined;

  // Un objet non instancié n'a pas d'identité côté API : il ne se déplace pas.
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: itemInstanceId ?? `${itemHash}-static`,
    disabled: !dragged,
    data: dragged,
  });

  // Pas d'infobulle sur l'objet qu'on déplace. Les autres sont masquées par le
  // CSS le temps du geste (voir `:root[data-dragging]`).
  const shown = open && !isDragging;

  const { refs, floatingStyles, context } = useFloating({
    open: shown,
    onOpenChange: setOpen,
    placement: "right-start",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  // Fermeture au clic extérieur et à Échap — la seule façon de la refermer,
  // puisqu'elle ne suit plus le curseur.
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    dismiss,
    role,
  ]);

  // Une seule vignette, deux bibliothèques : Floating UI a besoin de l'élément
  // pour se positionner, dnd-kit pour le mesurer.
  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      refs.setReference(node);
      setDragRef(node);
    },
    [refs, setDragRef],
  );

  return (
    <>
      <div
        ref={setRefs}
        {...attributes}
        {...getReferenceProps({
          ...listeners,
          onClick: () => setOpen((o) => !o),
          onDoubleClick: () => {
            if (!dragged) return;
            setOpen(false);
            equipOnSelected(dragged);
          },
        })}
        className={[
          "item",
          shape ? SHAPE_CLASS[shape] : null,
          open ? "item--pinned" : null,
          isDragging ? "item--dragging" : null,
          searchMiss ? "item--search-miss" : null,
          busy ? "item--busy" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-busy={busy || undefined}
      >
        <ItemThumb
          itemHash={itemHash}
          itemInstanceId={itemInstanceId}
          state={state}
          versionNumber={versionNumber}
          gearTier={gearTier}
          equipped={equipped}
        />
        {busy && (
          // Même animation que le panneau d'actions : elle vit dans le SVG
          // lui-même, aucune règle CSS d'ici ne l'atteint.
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/icons/loading.svg" alt="" className="item__spinner" />
        )}
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
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
