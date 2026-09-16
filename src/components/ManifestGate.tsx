"use client";

import type {ReactNode} from "react";
import {useTranslations} from "next-intl";
import {useManifest} from "@/lib/manifest/use-manifest";
import {LoadingIcon} from "@/components/icons";

/**
 * Garantit le manifeste, puis rend ses enfants.
 *
 * Rien d'autre que l'écran de chargement n'est rendu tant qu'il n'est pas là :
 * tout ce que l'application affiche — jusqu'au nom d'un objet — en vient, et
 * une vue montée avant lui n'aurait que des cases vides à montrer.
 *
 * Un composant à part et non un appel dans chaque écran : `useManifest` doit
 * être monté **une seule fois** par page, deux montages lançant deux
 * téléchargements concurrents. Il sert l'espace connecté (`Dashboard`) comme la
 * page publique d'un partage, qui n'a pas de compte mais a besoin du même
 * manifeste — il est public.
 */
export function ManifestGate({children}: {children: ReactNode}) {
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
                <LoadingIcon/>
            </div>
        );
    }

    return <>{children}</>;
}
