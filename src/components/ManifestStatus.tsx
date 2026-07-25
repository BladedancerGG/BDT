"use client";

import { useManifest } from "@/lib/manifest/use-manifest";

// Affiche l'état du chargement du manifeste (téléchargement / prêt / erreur).
export function ManifestStatus() {
  const { status, progress } = useManifest();

  if (status === "ready") {
    return <p className="text-sm text-emerald-400">Manifeste à jour ✓</p>;
  }

  if (status === "error") {
    return (
      <p className="text-sm text-red-400">
        Échec du chargement du manifeste (voir la console)
      </p>
    );
  }

  const pct = progress
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div className="flex flex-col items-center gap-2 text-sm text-neutral-400">
      <p>Chargement du manifeste… {pct}%</p>
      {progress && (
        <div className="h-1.5 w-48 overflow-hidden rounded bg-neutral-700">
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
