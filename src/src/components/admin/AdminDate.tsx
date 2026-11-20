"use client";

import {useSyncExternalStore} from "react";
import {useLocale} from "next-intl";

const noop = () => () => {};

/**
 * Une date dans le fuseau du NAVIGATEUR.
 *
 * Le serveur tourne en UTC, et next-intl n'a pas de fuseau configuré : rendue
 * côté serveur, l'heure serait fausse pour quiconque n'est pas à Greenwich.
 * Le premier rendu (serveur, puis hydratation) affiche donc l'heure UTC,
 * marquée comme telle, et le client la remplace aussitôt — sans écart
 * d'hydratation, les deux premiers rendus étant identiques.
 */
export function AdminDate({value}: { value: string | null }) {
    const locale = useLocale();
    const client = useSyncExternalStore(noop, () => true, () => false);
    if (!value) return null;
    const date = new Date(value);
    return (
        <time dateTime={value} title={value}>
            {client
                ? new Intl.DateTimeFormat(locale, {dateStyle: "short", timeStyle: "medium"}).format(date)
                : `${value.slice(0, 19).replace("T", " ")} UTC`}
        </time>
    );
}
