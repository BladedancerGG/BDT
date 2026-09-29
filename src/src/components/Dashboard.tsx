"use client";

import {ManifestGate} from "./ManifestGate";
import {InventoryView} from "./InventoryView";

// Composant racine de l'espace connecté : garantit le manifeste puis affiche
// l'inventaire. L'attente vit dans `ManifestGate`, que la page publique d'un
// partage monte elle aussi — c'est le même manifeste, et la même règle du
// téléchargement unique.
//
// Rien n'est rendu tant qu'il n'est pas là — l'en-tête compris, qui porte les
// onglets de personnage et n'aurait rien à y montrer.
export function Dashboard({
                              bungieMembershipId,
                              displayName,
                          }: {
    bungieMembershipId?: string;
    displayName?: string;
}) {
    return (
        <ManifestGate>
            <InventoryView
                bungieMembershipId={bungieMembershipId}
                displayName={displayName}
            />
        </ManifestGate>
    );
}
