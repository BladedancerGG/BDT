"use client";

import {useTranslations} from "next-intl";
import {useManifest} from "@/lib/manifest/use-manifest";
import {InventoryView} from "./InventoryView";
import {LoadingIcon} from "@/components/icons"

// Composant racine de l'espace connecté : garantit le manifeste puis affiche
// l'inventaire. On centralise ici l'appel à useManifest pour éviter des
// téléchargements concurrents.
//
// Rien d'autre que les écrans de chargement n'est rendu tant que le manifeste
// n'est pas là — l'en-tête compris, qui porte les onglets de personnage et
// n'aurait rien à y montrer.
export function Dashboard({
                              bungieMembershipId,
                              displayName,
                          }: {
    bungieMembershipId?: string;
    displayName?: string;
}) {
    const t = useTranslations("manifest");
    const {status, progress} = useManifest();

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
                    <div className="manifest-loader__fill" style={{width: `${pct}%`}}/>
                </div>
                <LoadingIcon />
            </div>
        );
    }

    return (
        <InventoryView
            bungieMembershipId={bungieMembershipId}
            displayName={displayName}
        />
    );
}
