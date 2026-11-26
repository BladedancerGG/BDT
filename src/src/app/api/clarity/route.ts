import {NextResponse} from "next/server";
import {getClarityUrl} from "@/lib/clarity/server-cache";

// GET /api/clarity
// Adresse du fichier des descriptions communautaires de Clarity, servi par
// Caddy (voir lib/clarity/server-cache.ts). Publique, comme le manifeste : la
// page d'un partage affiche les mêmes infobulles sans compte.
//
// `no-cache` : l'adresse change à chaque publication de Clarity, le fichier
// qu'elle désigne, lui, jamais.
export async function GET() {
    const url = await getClarityUrl();
    if (!url) {
        return NextResponse.json({error: "clarity_unavailable"}, {status: 503});
    }
    return NextResponse.json({url}, {headers: {"Cache-Control": "no-cache"}});
}
