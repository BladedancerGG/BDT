"use client";

import { useCallback, useState } from "react";
import {
  useFloating,
  useDismiss,
  useRole,
  useInteractions,
  useTransitionStatus,
  offset,
  flip,
  shift,
  size,
  autoUpdate,
  FloatingPortal,
  FloatingOverlay,
} from "@floating-ui/react";
import { useDraggable } from "@dnd-kit/core";
import { useSharedDefinition } from "@/lib/destiny/item-defs";
import { useSearchMiss } from "@/lib/search/provider";
import { useItemBusy } from "@/lib/actions/store";
import { stackSubject } from "@/lib/destiny/moves";
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
import { useSheetLayout } from "@/lib/ui/use-media-query";
import { LoadingIcon } from "./icons";

/** Forme de la vignette : les doctrines ne sont pas carrées. */
const SHAPE_CLASS = {
  elemental: "item--shape-diamond",
  prismatic: "item--shape-circle",
} as const;

/**
 * Durée de l'aller-retour de la feuille basse, en millisecondes.
 *
 * ⚠ En double avec `$duration` de `scss/components/item-sheet.scss` : c'est le
 * CSS qui anime, mais c'est le JavaScript qui décide combien de temps la
 * feuille reste montée. Les deux valeurs doivent rester égales, sinon la
 * feuille est arrachée avant la fin de son glissement.
 */
const SHEET_TRANSITION = 220;

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
/**
 * Neutralise le prochain clic, où qu'il tombe.
 *
 * En capture et en `once` : il passe avant tout gestionnaire de la page, et ne
 * vaut que pour un seul événement. Le minuteur est le filet — sans lui, un
 * `pointerdown` non suivi d'un clic laisserait l'écouteur en place, et c'est le
 * clic d'après, légitime celui-là, qui serait mangé.
 */
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  document.addEventListener("click", swallow, {capture: true, once: true});
  window.setTimeout(
    () => document.removeEventListener("click", swallow, {capture: true}),
    400,
  );
}


export function ItemIcon({
  itemHash,
  itemInstanceId,
  state,
  versionNumber,
  gearTier,
  equipped,
  quantity,
  bucketHash,
}: ItemThumbProps & {
  itemInstanceId?: string;
  /**
   * Emplacement où l'objet se trouve **en ce moment**. Il ne sert qu'aux objets
   * non instanciés : c'est la seule chose qui distingue une pile de mods rangée
   * d'une pile du même mod au coffre — voir `stackSubject`.
   */
  bucketHash?: number;
}) {
  const def = useSharedDefinition(itemHash);
  const shape = subclassKind(def);
  const [open, setOpen] = useState(false);

  // Écarté par la recherche : la vignette pâlit. Les objets équipés et ceux de
  // l'inventaire d'un personnage ne disparaissent jamais — seuls le coffre et
  // les objets perdus peuvent être filtrés, et cela se décide plus haut.
  const searchMiss = useSearchMiss(itemHash, itemInstanceId);

  // Seules les actions transitent par le contexte : l'objet en cours de
  // déplacement en est volontairement absent, il re-rendrait toutes les
  // vignettes montées à chaque saisie.
  const { equipOnSelected, selectedCharacterId } = useMoveActions();

  /**
   * Ce qui identifie l'objet dans la file d'actions.
   *
   * Une instance a son identifiant ; une pile — mod, consommable, matériau —
   * n'en a pas côté API et reçoit celui de synthèse, qui porte son hash et
   * l'endroit où elle est. Sans lui, ni l'attente affichée sur la vignette ni le
   * planificateur n'auraient de quoi la désigner.
   */
  const subject =
    itemInstanceId ?? stackSubject(itemHash, bucketHash, selectedCharacterId);

  // Déplacement en attente de Bungie : la vignette est grisée le temps de la
  // réponse. Le cache local n'est rejoué qu'une fois l'étape acquittée, donc
  // l'objet reste visuellement à son ancienne place jusque-là — sans ce
  // retour, rien ne distinguerait un ordre parti d'un ordre ignoré.
  const busy = useItemBusy(subject);

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
  const dragged: DraggedItem | undefined = subject
    ? {
        itemInstanceId: subject,
        itemHash,
        state,
        versionNumber,
        gearTier,
        quantity,
      }
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
    id: `${idPrefix}${subject ?? `${itemHash}-static`}`,
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

  // Sur téléphone l'infobulle n'est plus ancrée : elle monte du bas, pleine
  // largeur. Elle fait 365 px et se place à droite de la vignette — deux
  // exigences qu'un écran de 360 px ne peut pas tenir à la fois.
  const sheet = useSheetLayout();

  const { refs, floatingStyles, context } = useFloating({
    open: shown,
    onOpenChange: setOpen,
    placement: "right-start",
    middleware: [
      offset(8),
      // Les replis verticaux comptent autant que l'horizontal : une infobulle
      // de 365 px n'entre à côté d'une vignette que si l'un des deux côtés a la
      // place. Au milieu d'une fenêtre étroite, aucun des deux ne l'a — `shift`
      // la ramenait alors dans l'écran par-dessus la vignette même qu'on venait
      // de toucher. En haut ou en bas, la largeur entière est disponible.
      flip({
        fallbackPlacements: [
          "left-start",
          "bottom-start",
          "top-start",
          "bottom",
          "top",
        ],
      }),
      shift({ padding: 8 }),
      // Et si elle est plus haute que la place restante, elle défile au lieu
      // de sortir de l'écran par le bas.
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.setProperty(
            "--tooltip-max-height",
            `${availableHeight}px`,
          );
        },
      }),
    ],
    // Rien à suivre quand elle ne s'ancre à rien : le recalcul permanent
    // n'aurait ici qu'un coût.
    whileElementsMounted: sheet ? undefined : autoUpdate,
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
      if (target instanceof Element && target.closest(".socket-picker")) {
        return false;
      }
      // Une AUTRE vignette fait exception : son clic doit ouvrir son
      // infobulle, comme si rien n'était ouvert. L'avaler obligeait à cliquer
      // deux fois — une pour refermer, une pour ouvrir. La nôtre, elle, garde
      // l'avalement : le clic y rouvrirait aussitôt ce que le congé referme.
      const vignette = target instanceof Element ? target.closest(".item") : null;
      if (vignette && vignette !== refs.reference.current) return true;
      // Le congé se décide sur le `pointerdown` ; le `click` qui le suit, lui,
      // atteint ce qui se trouve dessous. Refermer une infobulle en touchant à
      // côté déclenchait donc ce qu'on avait touché — la vignette voisine, ou
      // l'un des boutons de son pied. On avale ce clic-là, et lui seul : le
      // délai reprend l'écouteur si aucun ne vient (un appui maintenu, un
      // glissement, un pointeur relâché ailleurs).
      swallowNextClick();
      return true;
    },
  });
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    dismiss,
    role,
  ]);

  // La feuille basse glisse aussi pour SORTIR : Floating UI la garde montée le
  // temps de l'animation et pose l'étape en `data-status`, que le SCSS lit.
  // Durée nulle hors téléphone — l'infobulle ancrée paraît et disparaît net, la
  // garder montée 220 ms de plus ne ferait que retarder sa disparition.
  const { isMounted, status } = useTransitionStatus(context, {
    duration: sheet ? SHEET_TRANSITION : 0,
  });

  // Une seule vignette, deux bibliothèques : Floating UI a besoin de l'élément
  // pour se positionner, dnd-kit pour le mesurer.
  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      refs.setReference(node);
      setDragRef(node);
    },
    [refs, setDragRef],
  );

  // Même infobulle des deux côtés : seul son contenant change.
  const tooltip = (
    <ItemTooltip
      itemHash={itemHash}
      itemInstanceId={itemInstanceId}
      state={state}
      versionNumber={versionNumber}
      gearTier={gearTier}
      onClose={() => setOpen(false)}
    />
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
            // Une pile ne s'équipe pas : le double-clic n'a rien à y faire.
            if (!dragged || !itemInstanceId || selecting || snapshot) return;
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
          quantity={quantity}
        />
        {busy && (
          // Même animation que le panneau d'actions : elle vit dans le SVG
          // lui-même (balises <animate>), pas dans une règle CSS.
          <LoadingIcon className="item__spinner" />
        )}
      </div>

      {isMounted && (
        <FloatingPortal>
          {sheet ? (
            // Le voile ferme au toucher — c'est `useDismiss` qui s'en charge,
            // tout ce qui n'est pas la feuille étant « au-dehors ». Il bloque
            // aussi le défilement derrière elle.
            <FloatingOverlay
              className="item-sheet__scrim"
              data-status={status}
              lockScroll
            >
              <div
                ref={refs.setFloating}
                {...getFloatingProps()}
                className="item-sheet"
                data-status={status}
              >
                {tooltip}
              </div>
            </FloatingOverlay>
          ) : (
            <div
              // setFloating est un callback ref stable fourni par Floating UI
              // (API documentée), pas une lecture de ref pendant le rendu.
              // eslint-disable-next-line react-hooks/refs
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className="floating-layer"
            >
              {tooltip}
            </div>
          )}
        </FloatingPortal>
      )}
    </>
  );
}
