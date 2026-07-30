"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { SettingsModal } from "./settings/SettingsModal";

/**
 * Boutons du header : rafraîchir l'état des objets, ouvrir les paramètres.
 */
export function HeaderActions({
  bungieMembershipId,
}: {
  bungieMembershipId?: string;
}) {
  const t = useTranslations("header");
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Le profil porte l'état équipé de tous les objets : l'invalider suffit
  const refreshing = useIsFetching({ queryKey: ["profile"] }) > 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    // Les détails chargés à l'unité (repli) deviennent aussi obsolètes
    queryClient.invalidateQueries({ queryKey: ["item"] });
  };

  return (
    <>
      <div className="header-actions">
        <button
          type="button"
          className="btn btn--small"
          onClick={refresh}
          disabled={refreshing}
          title={t("refreshHint")}
        >
          <span
            className={`header-actions__spin${
              refreshing ? " header-actions__spin--active" : ""
            }`}
            aria-hidden
          >
            ⟳
          </span>
          {refreshing ? t("refreshing") : t("refresh")}
        </button>

        <button
          type="button"
          className="btn btn--small"
          onClick={() => setSettingsOpen(true)}
        >
          <span aria-hidden>⚙</span>
          {t("settings")}
        </button>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        bungieMembershipId={bungieMembershipId}
      />
    </>
  );
}
