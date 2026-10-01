import {NextResponse} from "next/server";
import {readShare} from "@/lib/loadouts/share/read";
import {isShareKind} from "@/lib/loadouts/share/types";

/**
 * GET /api/shares/:id?kind=group|loadout — l'instantané d'un partage, pour
 * l'importer.
 *
 * Sans session, comme la page publique qui montre déjà tout ce que cette
 * réponse contient : la réserver aux comptes connectés ne protégerait rien. Le
 * genre est exigé pour la même raison que sur les pages — voir `readShare`.
 */
export async function GET(
    request: Request,
    {params}: {params: Promise<{id: string}>},
) {
    const {id} = await params;
    const kind = new URL(request.url).searchParams.get("kind");
    if (!isShareKind(kind)) {
        return NextResponse.json({error: "invalid_kind"}, {status: 400});
    }

    const share = await readShare(kind, id);
    if (!share) return NextResponse.json({error: "not_found"}, {status: 404});

    return NextResponse.json({snapshot: share.snapshot, author: share.author});
}
