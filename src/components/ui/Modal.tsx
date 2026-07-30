"use client";

import type { ReactNode } from "react";
import {
  useFloating,
  useDismiss,
  useRole,
  useInteractions,
  FloatingOverlay,
  FloatingFocusManager,
  FloatingPortal,
} from "@floating-ui/react";

/**
 * Fenêtre modale accessible.
 *
 * Floating UI fournit le piégeage du focus, la fermeture par Échap ou clic sur
 * l'arrière-plan, et les rôles ARIA. `FloatingOverlay lockScroll` empêche la
 * page de défiler derrière.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { refs, context } = useFloating({
    open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
  });

  const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  if (!open) return null;

  return (
    <FloatingPortal>
      <FloatingOverlay className="modal-overlay" lockScroll>
        <FloatingFocusManager context={context} modal>
          <div
            // setFloating est un callback ref stable de Floating UI
            // eslint-disable-next-line react-hooks/refs
            ref={refs.setFloating}
            {...getFloatingProps()}
            aria-label={title}
            className="modal"
          >
            {children}
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
