"use client";

import { useManifest } from "@/lib/manifest/use-manifest";
import { InventoryView } from "./InventoryView";

// Composant racine de l'espace connecté : garantit le manifeste puis affiche
// l'inventaire. On centralise ici l'appel à useManifest pour éviter des
// téléchargements concurrents.
export function Dashboard() {
  const { status, progress } = useManifest();

  if (status === "error") {
    return (
      <p className="text-sm text-red-400">
        Échec du chargement du manifeste (voir la console).
      </p>
    );
  }

  if (status === "loading") {
    const pct = progress
      ? Math.round((progress.done / progress.total) * 100)
      : 0;
    return (
      <div className="flex flex-col items-center gap-2 text-sm text-neutral-400">
        <p>Chargement du manifeste… {pct}%</p>
        <div className="h-1.5 w-48 overflow-hidden rounded bg-neutral-700">
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return <InventoryView />;
}
