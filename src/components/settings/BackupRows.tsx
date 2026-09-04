"use client";

import {useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {useSettings, mergeSettings, persistedSettings} from "@/lib/settings/store";
import {useLoadoutGroups} from "@/lib/loadouts/groups/store";
import {
    backupFileName,
    buildBackup,
    readBackup,
    type BackupFailure,
} from "@/lib/settings/backup";
import {SettingRow} from "@/components/ui/SettingRow";
import {ArrowDownTrayIcon, ArrowUpTrayIcon} from "@heroicons/react/24/solid";

/** Ce que l'import vient de faire, à dire à l'utilisateur. */
type Outcome =
    | {kind: "done"; settings: boolean; groups: number}
    | {kind: "failed"; failure: BackupFailure};

/**
 * Exporter et réimporter les préférences et les groupes, en JSON.
 *
 * Les deux gestes vivent dans la catégorie « Compte » aux côtés de la
 * synchronisation, dont ils sont le pendant hors ligne : celle-ci dépose l'état
 * sur le serveur, ceux-ci le rendent au propriétaire — sous une forme qu'il peut
 * lire, ranger et relire ailleurs.
 *
 * L'import **remplace** ce qui est en place, il ne fusionne pas : fusionner deux
 * jeux de groupes demanderait de trancher les conflits d'identifiant, et rien ne
 * dit lequel garder. D'où la confirmation.
 */
export function BackupRows() {
    const t = useTranslations("settings.account");
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const download = () => {
        const now = new Date();
        const backup = buildBackup(
            persistedSettings(useSettings.getState()),
            useLoadoutGroups.getState().groups,
            now,
        );

        // Un lien synthétique et une URL d'objet : c'est la seule façon de
        // proposer un fichier construit en mémoire. L'URL est révoquée aussitôt
        // — la retenir fuirait le contenu jusqu'au rechargement de la page.
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(backup, null, 2)], {
                type: "application/json",
            }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = backupFileName(now);
        link.click();
        URL.revokeObjectURL(url);

        setOutcome(null);
    };

    const load = async (file: File) => {
        const result = readBackup(await file.text());
        if (!result.ok) {
            setOutcome({kind: "failed", failure: result.failure});
            return;
        }

        const {settings, groups} = result.contents;
        // Ce que le fichier va écraser, annoncé avant de le faire.
        if (
            !window.confirm(
                t("importConfirm", {
                    // `select` et non `plural` : c'est un oui/non, et une chaîne
                    // se lit mieux qu'un 0/1 dans le message.
                    settings: String(settings !== undefined),
                    groups: groups?.length ?? 0,
                }),
            )
        ) {
            return;
        }

        if (settings) {
            // `mergeSettings` relit ce qu'il reconnaît et laisse le reste aux
            // valeurs par défaut : un fichier d'une version antérieure passe
            // sans migration. L'abonnement de `SettingsSync` renverra le tout
            // en base si la synchronisation est active.
            useSettings.setState(mergeSettings(settings, useSettings.getState()));
        }
        if (groups) useLoadoutGroups.getState().replaceAll(groups);

        setOutcome({
            kind: "done",
            settings: settings !== undefined,
            groups: groups?.length ?? 0,
        });
    };

    return (
        <>
            <SettingRow label={t("export")} hint={t("exportHint")}>
                <button type="button" className="btn btn--small" onClick={download}>
                    <ArrowDownTrayIcon/>
                    {t("exportAction")}
                </button>
            </SettingRow>

            <SettingRow label={t("import")} hint={t("importHint")}>
                <div className="settings__backup">
                    {/* Le champ natif est masqué : son habillage varie d'un
                        système à l'autre et jurerait avec les autres lignes.
                        C'est le bouton qui l'ouvre. */}
                    <input
                        ref={fileInput}
                        type="file"
                        accept="application/json,.json"
                        className="settings__file"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            // La valeur est remise à zéro : sans cela, réimporter
                            // le MÊME fichier après une correction ne
                            // déclencherait aucun changement.
                            event.target.value = "";
                            if (file) void load(file);
                        }}
                    />
                    <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => fileInput.current?.click()}
                    >
                        <ArrowUpTrayIcon/>
                        {t("importAction")}
                    </button>

                    {outcome && (
                        <p
                            className={`settings__backup-result${
                                outcome.kind === "failed"
                                    ? " settings__backup-result--error"
                                    : ""
                            }`}
                            role="status"
                        >
                            {outcome.kind === "failed"
                                ? t(`importFailure.${outcome.failure}`)
                                : t("importDone", {
                                    settings: String(outcome.settings),
                                    groups: outcome.groups,
                                })}
                        </p>
                    )}
                </div>
            </SettingRow>
        </>
    );
}
