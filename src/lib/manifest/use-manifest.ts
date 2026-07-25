"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { ensureManifest, type ManifestProgress } from "./manifest";

export type ManifestStatus = "loading" | "ready" | "error";

/**
 * Charge le manifeste pour la langue courante au montage.
 * Renvoie l'état et la progression du téléchargement.
 */
export function useManifest() {
  const locale = useLocale();
  const [status, setStatus] = useState<ManifestStatus>("loading");
  const [progress, setProgress] = useState<ManifestProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    ensureManifest(locale, (p) => {
      if (!cancelled) setProgress(p);
    })
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((err) => {
        console.error("Manifeste:", err);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  return { status, progress };
}
