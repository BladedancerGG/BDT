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
import {
  pickableBucket,
  useGroupSelection,
} from "@/lib/loadouts/groups/selection";
import { useSnapshotEditing } from "@/lib/loadouts/groups/snapshot-edit";
import {
  useDragScope,
  useMoveActions,
  type DraggedItem,
} from "./dnd/MoveDnd";
import { ItemThumb, type ItemThumbProps } from "./ItemThumb";
import { ItemTooltip } from "./tooltip/ItemTooltip";
import { LoadingIcon } from "./icons";

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
//
// Pendant une **sélection d'équipement** — remplir un emplacement de groupe
// depuis cette même vue — la vignette change de rôle : le clic retient l'objet
// au lieu d'ouvrir son infobulle, et le geste de déplacement est coupé. C'est le
// seul point de passage de toutes les vignettes de l'inventaire, donc le seul
// endroit où cette bascule s'écrit une fois.
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

  // Sélection d'équipement en cours. Trois abonnements étroits plutôt qu'un sur
  // l'état entier : la vignette ne doit se redessiner que si SON objet est
  // retenu ou relâché, pas à chaque clic ailleurs dans le coffre.
  const selecting = useGroupSelection((s) => s.active);
  const selectionClass = useGroupSelection((s) => s.classType);
  const foreign = useGroupSelection((s) => s.foreign);
  const pickBucket = selecting
    ? pickableBucket(def, selectionClass, itemInstanceId, foreign)
    : undefined;
  // `itemInstanceId` peut manquer : un objet non instancié n'a pas d'identité
  // côté API et ne peut donc pas être retenu.
  const pickable = pickBucket !== undefined && Boolean(itemInstanceId);
  const picked = useGroupSelection(
    (s) => pickBucket !== undefined && s.picked.get(pickBucket) === itemInstanceId,
  );
  const togglePick = useGroupSelection((s) => s.toggle);

  // La vignette décrit un instantané de groupe : elle s'ouvre et se modifie,
  // mais n'équipe rien. Double-cliquer y aurait équipé l'objet pour de vrai, ce
  // qui n'est pas ce qu'on vient y faire.
  const snapshot = useSnapshotEditing();
  // Contexte à part : les deux modes d'affichage sont montés ensemble, et ni le
  // geste ni les identifiants dnd-kit ne peuvent être communs — voir DragScope.
  const { disabled: dragDisabled, idPrefix } = useDragScope();

  // L'objet tel qu'il part en déplacement — par glisser-déposer comme par
  // double-clic. Les habillages en font partie : les vignettes du DragOverlay
  // et du panneau d'actions sont montées hors de la grille et ne peuvent pas
  // les retrouver seules.
  const dragged: DraggedItem | undefined = itemInstanceId
    ? { itemInstanceId, itemHash, state, versionNumber, gearTier }
    : undefined;

  // Un objet non instancié n'a pas d'identité côté API : il ne se déplace pas.
  // Le mode « équipements » désactive le geste pour tout le monde : il n'y a ni
  // inventaire d'emplacement ni coffre où déposer.
  //
  // L'identifiant est préfixé par le mode d'affichage : sans quoi les deux
  // vignettes d'un même objet équipé se disputent l'entrée de `draggableNodes`
  // — voir DragScope.idPrefix.
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `${idPrefix}${itemInstanceId ?? `${itemHash}-static`}`,
    // Pendant une sélection, la vignette n'est plus une poignée : on y clique
    // pour retenir l'objet, et un seuil de déplacement suffirait à transformer
    // ce clic en glissement vers une zone de dépôt.
    disabled: !dragged || dragDisabled || selecting,
    data: dragged,
  });

  // Pas d'infobulle sur l'objet qu'on déplace, ni pendant une sélection : le
  // clic y sert à retenir l'objet, et une infobulle ouverte masquerait la
  // grille où l'on choisit.
  const shown = open && !isDragging && !selecting;

  const { refs, floatingStyles, context } = useFloating({
    open: shown,
    onOpenChange: setOpen,
    placement: "right-start",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  // Fermeture au clic extérieur et à Échap — la seule façon de la refermer,
  // puisqu'elle ne suit plus le curseur.
  //
  // Le sélecteur d'attributs (deuxième infobulle) est rendu dans son propre
  // portail : il n'est donc pas un descendant DOM de celle-ci, et un clic
  // dedans passerait pour un clic extérieur. Il refermerait tout au moment
  // même où l'on choisit un mod.
  const dismiss = useDismiss(context, {
    outsidePress: (event) => {
      const target = event.target;
      return !(target instanceof Element && target.closest(".socket-picker"));
    },
  });
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
          onClick: () => {
            // En sélection, le clic retient l'objet — et ne fait rien d'autre.
            // Un objet inéligible (autre classe, non équipable) ne réagit pas :
            // ouvrir son infobulle laisserait croire qu'il est choisissable.
            if (selecting) {
              if (pickable && itemInstanceId && pickBucket !== undefined) {
                togglePick(pickBucket, itemInstanceId);
              }
              return;
            }
            setOpen((o) => !o);
          },
          onDoubleClick: () => {
            // Équiper depuis une sélection ou depuis l'éditeur d'un groupe
            // n'aurait aucun sens : on désigne ce qu'un groupe portera, on ne
            // l'équipe pas maintenant.
            if (!dragged || selecting || snapshot) return;
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
          picked ? "item--picked" : null,
          selecting && !pickable ? "item--unpickable" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-busy={busy || undefined}
        aria-pressed={selecting && pickable ? picked : undefined}
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
          // lui-même (balises <animate>), pas dans une règle CSS.
          <LoadingIcon className="item__spinner" />
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
