"use client";

import { useTranslations } from "next-intl";
import { useManifest } from "@/lib/manifest/use-manifest";
import { InventoryView } from "./InventoryView";

// Composant racine de l'espace connecté : garantit le manifeste puis affiche
// l'inventaire. On centralise ici l'appel à useManifest pour éviter des
// téléchargements concurrents.
export function Dashboard() {
  const t = useTranslations("manifest");
  const { status, progress } = useManifest();

  if (status === "error") {
    return (
      <div className="manifest-loader manifest-loader--error">
        <p>{t("error")}</p>
      </div>
    );
  }

  if (status === "loading") {
    const pct = progress
      ? Math.round((progress.done / progress.total) * 100)
      : 0;
    return (
      <div className="manifest-loader">
        <p>
          {t("loading")} {pct}%
        </p>
        <div className="manifest-loader__track">
          <div className="manifest-loader__fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <InventoryView />
    </div>
  );
}
