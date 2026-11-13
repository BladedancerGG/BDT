import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getTranslations} from "next-intl/server";
import {UiCatalog} from "@/components/dev/UiCatalog";

/**
 * Catalogue des éléments d'interface — un outil de développement.
 *
 * Absent en production : la page n'existe que sous `next dev`. Le test porte sur
 * `NODE_ENV` et non sur un réglage : c'est la seule chose que l'image de
 * production fixe à coup sûr (voir le Dockerfile), et un oubli de variable n'y
 * exposerait pas une page qui manipule la file d'actions.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("catalog");
    return {title: t("title"), robots: {index: false, follow: false}};
}

export default function UiCatalogPage() {
    if (process.env.NODE_ENV === "production") notFound();
    return <UiCatalog/>;
}
