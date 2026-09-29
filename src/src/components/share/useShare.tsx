"use client";

import {useCallback, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {routing} from "@/i18n/routing";
import type {SharedSnapshot} from "@/lib/loadouts/share/types";
import {hasSharedItems} from "@/lib/loadouts/share/snapshot";
import {Modal} from "@/components/ui/Modal";
import {CheckIcon, ClipboardIcon} from "@heroicons/react/24/solid";

type ShareState =
    | {status: "pending"}
    | {status: "error"; reason: "empty" | "failed"}
    | {status: "ready"; url: string};

/**
 * Dépose un partage et en montre le lien.
 *
 * Un hook et non un bouton : le geste part d'endroits qui n'ont pas la même
 * forme — le calque d'actions d'une carte, la barre d'outils de l'éditeur — mais
 * tous doivent aboutir à la même modale. L'appelant construit l'instantané
 * (lui seul a le profil sous la main) et le passe ; le reste se joue ici.
 *
 * La modale est rendue par l'appelant, où il veut : c'est un portail, sa place
 * dans l'arbre n'a aucune incidence.
 */
export function useShare(): {
    share: (snapshot: SharedSnapshot) => void;
    dialog: React.ReactNode;
} {
    const t = useTranslations("share");
    const locale = useLocale();
    const [state, setState] = useState<ShareState | null>(null);
    const [copied, setCopied] = useState(false);

    const share = useCallback(
        (snapshot: SharedSnapshot) => {
            setCopied(false);
            // Un partage sans un seul objet ne montrerait qu'une page vide :
            // autant le dire tout de suite plutôt que de déposer un lien qui
            // décevra son destinataire.
            if (!hasSharedItems(snapshot)) {
                setState({status: "error", reason: "empty"});
                return;
            }

            setState({status: "pending"});
            void (async () => {
                try {
                    const response = await fetch("/api/shares", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({snapshot}),
                    });
                    if (!response.ok) throw new Error(String(response.status));
                    const {path} = (await response.json()) as {path: string};
                    // Le lien garde la langue de celui qui partage : c'est
                    // celle dans laquelle il vient de lire ce qu'il envoie. La
                    // langue par défaut n'est pas préfixée (voir i18n/routing).
                    const prefix =
                        locale === routing.defaultLocale ? "" : `/${locale}`;
                    setState({
                        status: "ready",
                        url: `${window.location.origin}${prefix}${path}`,
                    });
                } catch {
                    setState({status: "error", reason: "failed"});
                }
            })();
        },
        [locale],
    );

    const copy = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch {
            // Refusé par le navigateur (page non sécurisée, permission) : le
            // lien reste affiché dans un champ, sélectionnable à la main.
            setCopied(false);
        }
    };

    const dialog = (
        <Modal
            open={state !== null}
            onClose={() => setState(null)}
            title={t("title")}
            compact
        >
            <div className="share-dialog">
                <h2 className="share-dialog__title">{t("title")}</h2>

                {state?.status === "pending" && (
                    <p className="share-dialog__message">{t("pending")}</p>
                )}

                {state?.status === "error" && (
                    <p className="share-dialog__message share-dialog__message--error">
                        {state.reason === "empty" ? t("empty") : t("failed")}
                    </p>
                )}

                {state?.status === "ready" && (
                    <>
                        <p className="share-dialog__message">{t("ready")}</p>
                        <div className="share-dialog__link">
                            <input
                                className="share-dialog__url"
                                type="text"
                                readOnly
                                value={state.url}
                                aria-label={t("linkLabel")}
                                // Tout sélectionner au focus : le lien est long,
                                // et le champ n'est là que pour être recopié —
                                // au clavier comme si le presse-papier a été
                                // refusé.
                                onFocus={(event) => event.currentTarget.select()}
                            />
                            <button
                                type="button"
                                className="btn btn--small btn--primary"
                                onClick={() => void copy(state.url)}
                            >
                                {copied ? <CheckIcon/> : <ClipboardIcon/>}
                                {copied ? t("copied") : t("copy")}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );

    return {share, dialog};
}
