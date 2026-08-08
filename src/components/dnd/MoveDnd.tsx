"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMovePlanner } from "@/lib/actions/use-move-planner";
import type { MoveTarget } from "@/lib/destiny/moves";
import { ItemThumb, type ItemThumbProps } from "../ItemThumb";

/**
 * L'objet saisi, tel qu'il voyage dans `active.data`.
 *
 * Il porte de quoi **redessiner** la vignette, pas seulement de quoi
 * l'identifier : la vignette qui suit le curseur est montée hors de la grille,
 * elle n'a donc accès à aucune des données d'instance de celle d'origine. Sans
 * `state` / `versionNumber` / `gearTier`, elle perdait filigrane, palier et
 * marquages en cours de geste.
 */
export interface DraggedItem extends ItemThumbProps {
  /** Un objet non instancié ne se déplace pas : ici l'identifiant est requis. */
  itemInstanceId: string;
}

/** Attribut portant la destination d'une zone, lu au moment du dépôt. */
export const DROP_TARGET_ATTR = "data-drop-target";

/**
 * Identifiant d'une zone de dépôt, et sa lecture.
 *
 * La destination voyage dans une chaîne, posée en attribut sur la zone : c'est
 * ce que `dropTargetAt` retrouve sous le curseur au relâchement.
 */
export const zoneId = (target: MoveTarget): string =>
  target.kind === "vault" ? "vault" : `${target.kind}:${target.characterId}`;

function parseZone(id: string): MoveTarget | null {
  if (id === "vault") return { kind: "vault" };
  const [kind, characterId] = id.split(":");
  if (!characterId) return null;
  if (kind === "inventory") return { kind: "inventory", characterId };
  if (kind === "equipped") return { kind: "equipped", characterId };
  return null;
}

/**
 * Aucune détection de collision.
 *
 * `over` vit dans le contexte interne de dnd-kit, que **tout** objet
 * déplaçable lit : le faire changer au passage d'une zone re-rendait la
 * centaine de vignettes montées, d'où le à-coup au survol. En ne désignant
 * jamais de cible, `over` reste `null` du début à la fin du geste.
 *
 * La zone survolée se met en avant en CSS (`:hover`), et celle du dépôt se
 * retrouve géométriquement — voir `dropTargetAt`.
 */
const noCollisions = () => [];

/**
 * Zone située à un point de l'écran, ou null si ce n'en est pas une.
 *
 * Le `delta` de dnd-kit ne conviendrait pas : il intègre un ajustement de
 * défilement, et ne désigne donc plus la position du curseur dès que la page
 * bouge sous lui. On suit le pointeur nous-mêmes — une écriture dans une ref,
 * aucun rendu.
 */
function dropTargetAt(x: number, y: number): MoveTarget | null {
  const zone = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>(`[${DROP_TARGET_ATTR}]`);

  // Une destination impossible reste affichée : elle ne doit pas accepter
  // le dépôt pour autant.
  if (!zone || zone.dataset.dropDisabled === "true") return null;

  const id = zone.getAttribute(DROP_TARGET_ATTR);
  return id ? parseZone(id) : null;
}

/**
 * Signale le geste en cours sur `<html>`, pour que le CSS efface les
 * infobulles (voir `:root[data-dragging]` dans item-tooltip.scss).
 *
 * Un attribut plutôt qu'un état React : les infobulles vivent dans chacune des
 * quelque cent vignettes montées, et les prévenir par un contexte les
 * re-rendrait toutes — deux fois par geste.
 */
function markDragging(active: boolean) {
  const root = document.documentElement;
  if (active) root.dataset.dragging = "true";
  else delete root.dataset.dragging;
}

/** Ce dont les vignettes ont besoin — stable pendant toute la durée d'un geste. */
interface MoveActionsValue {
  /** Personnage dont l'équipement est affiché — cible du double-clic */
  selectedCharacterId: string | null;
  /** Équipe sur le personnage affiché (double-clic sur une vignette) */
  equipOnSelected: (item: DraggedItem) => void;
}

const MoveActionsContext = createContext<MoveActionsValue>({
  selectedCharacterId: null,
  equipOnSelected: () => {},
});

/**
 * Deux contextes plutôt qu'un : l'objet saisi change au début et à la fin du
 * geste, et il n'intéresse que les zones de dépôt. Le mêler aux actions
 * re-rendait toutes les vignettes une deuxième fois, en plus de celle que
 * dnd-kit provoque déjà.
 */
const DraggedItemContext = createContext<DraggedItem | null>(null);

export const useMoveActions = () => useContext(MoveActionsContext);
export const useDraggedItem = () => useContext(DraggedItemContext);

/**
 * Glisser-déposer des objets de l'inventaire.
 *
 * Le dépôt ne déplace rien lui-même : il met une action en file, que
 * l'exécuteur traduira en requêtes. C'est ce qui permet d'en enchaîner
 * plusieurs sans attendre.
 */
export function MoveDnd({
  selectedCharacterId,
  children,
}: {
  selectedCharacterId: string | null;
  children: ReactNode;
}) {
  const [dragged, setDragged] = useState<DraggedItem | null>(null);
  const { enqueue } = useMovePlanner();

  // Dernière position connue du curseur. Une ref, pas un état : elle change à
  // chaque mouvement et ne doit rien re-rendre.
  const pointer = useRef({ x: 0, y: 0 });

  const sensors = useSensors(
    // Sans seuil, un clic sur une vignette (qui épingle l'infobulle) passerait
    // pour un début de déplacement.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Le suivi n'est branché que pendant un geste : hors déplacement, ce serait
  // un écouteur de plus sur chaque mouvement de souris de l'application.
  useEffect(() => {
    if (!dragged) return;
    const track = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener("pointermove", track, { passive: true });
    return () => document.removeEventListener("pointermove", track);
  }, [dragged]);

  // Filet : si l'inventaire disparaît en plein geste, l'attribut resterait posé
  // sur <html> et masquerait définitivement toutes les infobulles.
  useEffect(() => () => markDragging(false), []);

  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const data = active.data.current as DraggedItem | undefined;
    if (!data) return;
    // Amorce : le seuil de saisie est franchi avant que l'écouteur ci-dessus
    // ne soit branché, un relâchement immédiat n'aurait sinon aucun point.
    if (activatorEvent instanceof PointerEvent) {
      pointer.current = {
        x: activatorEvent.clientX,
        y: activatorEvent.clientY,
      };
    }
    markDragging(true);
    setDragged(data);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragged(null);
    // La cible se lit AVANT de rendre les infobulles au curseur : les
    // réafficher d'abord en remettrait une sous le point de dépôt, et
    // `elementFromPoint` ne trouverait plus la zone.
    const target = dropTargetAt(pointer.current.x, pointer.current.y);
    markDragging(false);

    const item = event.active.data.current as DraggedItem | undefined;
    if (!target || !item) return;
    enqueue(item, target);
  };

  const actions = useMemo<MoveActionsValue>(
    () => ({
      selectedCharacterId,
      equipOnSelected: (item) => {
        if (!selectedCharacterId) return;
        enqueue(item, {
          kind: "equipped",
          characterId: selectedCharacterId,
        });
      },
    }),
    [selectedCharacterId, enqueue],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={noCollisions}
      // Les zones recouvrent la vue : il n'y a rien à faire défiler pendant le
      // geste, et le défilement automatique tourne à chaque image pour rien.
      autoScroll={false}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        markDragging(false);
        setDragged(null);
      }}
    >
      <MoveActionsContext.Provider value={actions}>
        <DraggedItemContext.Provider value={dragged}>
          {children}
        </DraggedItemContext.Provider>
      </MoveActionsContext.Provider>

      {/* Vignette suivant le curseur : sans elle, l'objet semble disparaître.
          Elle ne doit jamais capter le pointeur, sinon elle se trouve toujours
          entre lui et la zone visée — `:hover` et le dépôt en dépendent. */}
      <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
        {dragged && (
          // La classe .item porte la taille de la grille : .item-thumb se
          // dimensionne à 100 % de son parent et n'en a aucune par lui-même.
          <div className="item item--drag-overlay">
            <ItemThumb
              itemHash={dragged.itemHash}
              itemInstanceId={dragged.itemInstanceId}
              state={dragged.state}
              versionNumber={dragged.versionNumber}
              gearTier={dragged.gearTier}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
