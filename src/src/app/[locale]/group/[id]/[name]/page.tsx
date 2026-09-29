import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {readShare} from "@/lib/loadouts/share/read";
import {getTranslations} from "next-intl/server";
import {APP_TITLE} from "@/lib/app-info";
import {SharedLoadoutView} from "@/components/share/SharedLoadoutView";

/**
 * La page publique d'un groupe partagé.
 *
 * Le second segment n'est **pas** lu : c'est le nom du groupe au moment du
 * partage, là pour que le lien se lise, et il peut avoir changé depuis. Seul
 * l'identifiant désigne le partage.
 *
 * Aucune session n'est demandée, et c'est tout l'intérêt : le destinataire n'a
 * pas de compte à avoir. Ce qu'il voit est un instantané figé, résolu au dépôt
 * (voir `buildShare`).
 */
export default async function SharedGroupPage({
                                                  params,
                                              }: {
    params: Promise<{id: string}>;
}) {
    const {id} = await params;
    const share = await readShare("group", id);
    if (!share) notFound();

    return <SharedLoadoutView snapshot={share.snapshot} author={share.author}/>;
}

export async function generateMetadata({
                                           params,
                                       }: {
    params: Promise<{id: string}>;
}): Promise<Metadata> {
    const {id} = await params;
    const share = await readShare("group", id);
    if (!share) return {title: APP_TITLE};

    // Le titre vient du partage et non de l'URL : celle-ci est fournie par
    // celui qui ouvre le lien, et s'y fier reviendrait à laisser n'importe qui
    // écrire le titre d'une page du site.
    const t = await getTranslations("share");
    return {
        title: `${t("sharedBy", {
            user: share.author,
            name: share.snapshot.name,
        })} — ${APP_TITLE}`,
    };
}
