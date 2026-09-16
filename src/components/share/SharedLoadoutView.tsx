"use client";

import {useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
import type {ItemDetail} from "@/lib/bungie/item-components";
import {SharedSnapshotProvider} from "@/lib/bungie/shared-snapshot";
import {ItemDefsProvider, useItemDefs, type ItemRef} from "@/lib/destiny/item-defs";
import {countEquippedSets, EquippedSetsProvider} from "@/lib/destiny/set-bonus";
import {useLoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import {useSettings} from "@/lib/settings/store";
import type {
    SharedLoadoutSnapshot,
    SharedSnapshot,
} from "@/lib/loadouts/share/types";
import {ManifestGate} from "@/components/ManifestGate";
import {EquipmentModeView} from "@/components/equipment/EquipmentModeView";
import {LoadoutSlotHeading} from "@/components/loadouts/LoadoutSlotHeading";
import {GroupSlotGrid} from "@/components/groups/GroupSlotGrid";
import {DragScopeProvider, type DragScope} from "@/components/dnd/MoveDnd";

/**
 * Portée dnd-kit de la page publique : le geste y est interdit.
 *
 * Un instantané ne se déplace pas, et il n'y a de toute façon ni compte ni
 * profil derrière cette page. Le préfixe suit la règle des autres portées — voir
 * `DragScope` : les identifiants de dnd-kit sont globaux, et deux vignettes du
 * même objet se disputeraient la même entrée.
 */
const SHARE_DRAG_SCOPE: DragScope = {disabled: true, idPrefix: "share:"};

/**
 * La page publique d'un groupe ou d'un équipement partagé.
 *
 * Elle reprend la vue d'édition d'un groupe — les lignes d'objets à gauche, les
 * emplacements à droite — sous le nom `.group-preview` : c'est la même vue,
 * amputée de tout ce qui modifie. Rien n'y est cliquable que le choix de
 * l'emplacement affiché.
 *
 * Elle ne tient que de l'instantané reçu du serveur et du **manifeste**, qui est
 * public : le visiteur n'a ni session, ni profil, et les objets y sont déjà
 * résolus (voir `buildShare`). C'est ce qui permet à cette page d'exister sans
 * compte.
 */
export function SharedLoadoutView({
                                      snapshot,
                                      author,
                                  }: {
    snapshot: SharedSnapshot;
    /** Le nom Bungie de celui qui a partagé — voir `readShare` */
    author: string;
}) {
    return (
        <main className="app-main">
            <ManifestGate>
                <SharedDefs snapshot={snapshot} author={author}/>
            </ManifestGate>
        </main>
    );
}

/**
 * Les définitions de tous les objets du partage, en une requête groupée.
 *
 * Le même parti que `InventoryView` : une lecture Dexie par vignette ferait
 * des centaines de souscriptions pour une poignée d'emplacements.
 */
function SharedDefs({
                        snapshot,
                        author,
                    }: {
    snapshot: SharedSnapshot;
    author: string;
}) {
    const showOrnaments = useSettings((s) => s.showOrnaments);
    const showOriginalOnHover = useSettings((s) => s.showOriginalOnHover);

    const items = useMemo<ItemRef[]>(
        () =>
            snapshot.loadouts.flatMap((loadout) =>
                loadout.items.map((item) => ({
                    itemHash: item.itemHash,
                    itemInstanceId: item.itemInstanceId,
                })),
            ),
        [snapshot],
    );

    return (
        <ItemDefsProvider
            items={items}
            details={snapshot.details}
            withOrnaments={showOrnaments}
            withOriginalOnHover={showOriginalOnHover}
        >
            <SharedPreview snapshot={snapshot} author={author}/>
        </ItemDefsProvider>
    );
}

/**
 * Un objet partagé, rendu à la forme que toute la vue attend.
 *
 * `quantity` et `location` sont des valeurs de remplissage : l'affichage d'un
 * équipement ne les lit pas — il n'y a ni pile ni emplacement d'origine à y
 * montrer — et les emporter aurait alourdi chaque partage pour rien.
 */
function toComponent(item: SharedLoadoutSnapshot["items"][number]): DestinyItemComponent {
    return {
        itemHash: item.itemHash,
        itemInstanceId: item.itemInstanceId,
        bucketHash: item.bucketHash,
        state: item.state,
        versionNumber: item.versionNumber,
        quantity: 1,
        location: 0,
    };
}

function SharedPreview({
                           snapshot,
                           author,
                       }: {
    snapshot: SharedSnapshot;
    author: string;
}) {
    const t = useTranslations("share");
    const tGroups = useTranslations("groups");
    const tAuth = useTranslations("auth");
    const {defs} = useItemDefs();

    const [selected, setSelected] = useState(0);
    const isGroup = snapshot.kind === "group";
    // Un partage porte toujours au moins un emplacement (le contrat le vérifie),
    // mais l'index peut sortir de la liste si celle-ci changeait de taille.
    const current = snapshot.loadouts[selected] ?? snapshot.loadouts[0];

    /**
     * Les emplacements du partage rendus à la forme d'un `DestinyLoadout`.
     *
     * Tout ce qui dessine une vignette ou une grille lit cette forme-là, et il
     * n'y a pas de conversion cachée : les attributs enregistrés d'un objet
     * *sont* ses `plugItemHashes`, déjà résolus au dépôt (voir `buildShare`).
     * Un emplacement vide n'a aucun objet, ce que `isEmptyLoadout` reconnaît
     * comme en jeu.
     */
    const slots = useMemo<DestinyLoadout[]>(
        () =>
            snapshot.loadouts.map((loadout) => ({
                colorHash: loadout.colorHash,
                iconHash: loadout.iconHash,
                nameHash: loadout.nameHash,
                items: loadout.items.map((item) => ({
                    itemInstanceId: item.itemInstanceId,
                    plugItemHashes: loadout.sockets[item.itemInstanceId] ?? [],
                })),
            })),
        [snapshot],
    );

    const identifiers = useLoadoutIdentifiers(slots);

    const items = useMemo(() => current.items.map(toComponent), [current]);
    const sockets = useMemo(
        () => new Map(Object.entries(current.sockets)),
        [current],
    );

    /**
     * Le détail des objets de l'emplacement affiché, attributs **enregistrés**
     * en place de ceux de l'objet.
     *
     * C'est ce que lit l'infobulle, via `SharedSnapshotProvider` : le visiteur
     * n'a ni profil ni droit d'interroger `/api/item`, et sans cela elle
     * n'aurait eu ni attribut, ni mod, ni statistique à montrer.
     *
     * Reconstruit **par emplacement** et non pris tel quel dans le partage :
     * un même objet peut figurer dans deux emplacements avec deux
     * configurations — une doctrine et ses fragments, typiquement — et une
     * table commune aurait donné à l'un les attributs de l'autre.
     */
    const details = useMemo(() => {
        const out: Record<string, ItemDetail> = {};
        for (const item of current.items) {
            const base = snapshot.details[item.itemInstanceId];
            if (!base) continue;
            out[item.itemInstanceId] = {
                ...base,
                sockets: current.sockets[item.itemInstanceId] ?? base.sockets,
            };
        }
        return out;
    }, [current, snapshot.details]);

    const setCounts = useMemo(
        () => countEquippedSets(items, defs),
        [items, defs],
    );

    return (
        <EquippedSetsProvider counts={setCounts}>
            {/* Ce que lisent les infobulles : sur cette page, l'instantané
                tient lieu de profil — et dit du même coup qu'il n'y a rien à
                aller chercher sur le réseau. */}
            <SharedSnapshotProvider value={details}>
            <DragScopeProvider value={SHARE_DRAG_SCOPE}>
                <div className="views">
                    <section className="view group-preview">
                        <div className="group-preview__toolbar">
                            {/* Qui partage, et quoi : le nom seul ne disait pas
                                d'où vient le lien qu'on vient d'ouvrir. */}
                            <h1 className="group-preview__title">
                                {t("sharedBy", {
                                    user: author,
                                    name: snapshot.name,
                                })}
                            </h1>

                            {/* Le seul geste de la page : ce qu'on regarde
                                donne envie d'en faire autant, encore faut-il
                                dire où. L'accroche porte la proposition, le
                                bouton ne fait que l'exécuter. */}
                            <p className="group-preview__cta">
                                <span>{t("cta")}</span>
                                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                                <a
                                    href="/api/auth/login"
                                    className="btn btn--small btn--primary"
                                >
                                    {tAuth("login")}
                                </a>
                            </p>
                        </div>

                        <div className="group-preview__body">
                            <div className="group-preview__contents">
                                <EquipmentModeView
                                    title={
                                        <LoadoutSlotHeading
                                            loadout={slots[selected] ?? slots[0]}
                                            index={selected}
                                            identifiers={identifiers}
                                            label={t("sharedLabel")}
                                        />
                                    }
                                    items={items}
                                    details={details}
                                    defs={defs}
                                    setCounts={setCounts}
                                    // Les attributs montrés sont ceux que
                                    // l'équipement a enregistrés, pas ceux que
                                    // les objets portent aujourd'hui : chez le
                                    // visiteur, ils ne portent rien du tout.
                                    sockets={sockets}
                                    editable={false}
                                    // Un emplacement partagé peut être vide :
                                    // « Chargement… » y serait un mensonge que
                                    // rien ne viendrait démentir.
                                    quiet
                                />
                            </div>

                            {/* Les emplacements du groupe, comme dans l'éditeur :
                                un clic en ouvre le contenu à gauche. Absents
                                d'un équipement partagé seul, qui n'en a qu'un —
                                une grille d'une vignette n'aurait rien dit de
                                plus que le titre. */}
                            {isGroup && (
                                <div className="group-preview__slots">
                                    <GroupSlotGrid
                                        title={tGroups("groupSlots")}
                                        loadouts={slots}
                                        slotCount={slots.length}
                                        identifiers={identifiers}
                                        selected={selected}
                                        onSelect={setSelected}
                                    />
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </DragScopeProvider>
            </SharedSnapshotProvider>
        </EquippedSetsProvider>
    );
}
