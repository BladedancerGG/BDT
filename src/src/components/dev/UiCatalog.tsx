"use client";

import {useEffect, useState} from "react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useTranslations} from "next-intl";
import {useActionQueue} from "@/lib/actions/store";
import {buildCatalogProfile, CATALOG_CHARACTER, type CatalogProfile} from "@/lib/dev/catalog-profile";
import {ItemDefsProvider, useItemDefs, type ItemRef} from "@/lib/destiny/item-defs";
import {countEquippedSets, EquippedSetsProvider} from "@/lib/destiny/set-bonus";
import {useSettings} from "@/lib/settings/store";
import {SearchProvider} from "@/lib/search/provider";
import {BUCKET} from "@/lib/destiny/buckets";
import {ManifestGate} from "@/components/ManifestGate";
import {MoveDnd} from "@/components/dnd/MoveDnd";
import {LoadingIcon} from "@/components/icons";
import {CatalogSections, CATALOG_SECTIONS} from "./CatalogSections";

/**
 * Le catalogue des éléments d'interface, montés sur un profil fictif.
 *
 * Les composants sont **ceux de l'application**, pas des copies : un catalogue
 * qui redessinerait les siens divergerait au premier changement. Ce sont donc
 * leurs vraies dépendances qu'il faut satisfaire — d'où le profil construit
 * depuis le manifeste (`buildCatalogProfile`) et posé dans un client React
 * Query à part.
 */
export function UiCatalog() {
    return (
        <main className="app-main ui-catalog">
            <ManifestGate>
                <CatalogData/>
            </ManifestGate>
        </main>
    );
}

/**
 * Date de mise à jour du profil fictif, dans un futur lointain.
 *
 * `useProfile` impose son `staleTime` (cinq minutes) et relance sa requête au
 * retour sur l'onglet : passé ce délai, le vrai `/api/profile` aurait remplacé
 * le profil fictif — par celui du développeur s'il est connecté. Une donnée
 * datée de l'avenir n'est jamais périmée, et rien ici n'invalide la clé (le
 * bouton « Rafraîchir » de l'en-tête n'est pas monté, pour cette raison).
 */
const NEVER_STALE = Date.now() + 1000 * 60 * 60 * 24 * 365 * 10;

function CatalogData() {
    const t = useTranslations("catalog");
    const [profile, setProfile] = useState<CatalogProfile | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Un client à part : le profil fictif ne doit pas entrer dans le cache de
    // l'application, que la navigation client garderait au retour sur `/`.
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {queries: {retry: false, refetchOnWindowFocus: false}},
            }),
    );

    useEffect(() => {
        let cancelled = false;
        buildCatalogProfile().then(
            (built) => {
                if (cancelled) return;
                client.setQueryData(["profile"], built.data, {updatedAt: NEVER_STALE});
                setProfile(built);
            },
            (reason: unknown) => {
                if (!cancelled) setError(String(reason));
            },
        );
        return () => {
            cancelled = true;
        };
    }, [client]);

    if (error) {
        return (
            <div className="profile-loader profile-loader--error">
                <p className="profile-loader__message">{error}</p>
            </div>
        );
    }
    if (!profile) {
        return (
            <div className="profile-loader">
                <p className="profile-loader__message">{t("building")}</p>
                <LoadingIcon/>
            </div>
        );
    }

    return (
        <QueryClientProvider client={client}>
            <CatalogProviders profile={profile}/>
        </QueryClientProvider>
    );
}

/** Les mêmes fournisseurs que `InventoryView`, moins l'exécuteur d'actions. */
function CatalogProviders({profile}: {profile: CatalogProfile}) {
    const showOrnaments = useSettings((s) => s.showOrnaments);
    const showOriginalOnHover = useSettings((s) => s.showOriginalOnHover);
    const {data} = profile;

    const [items] = useState<ItemRef[]>(() =>
        [...Object.values(data.equipment), ...Object.values(data.inventory), data.vault]
            .flat()
            .map((item) => ({itemHash: item.itemHash, itemInstanceId: item.itemInstanceId})),
    );

    return (
        <ItemDefsProvider
            items={items}
            details={data.items}
            withOrnaments={showOrnaments}
            withOriginalOnHover={showOriginalOnHover}
        >
            <CatalogShell profile={profile}/>
        </ItemDefsProvider>
    );
}

function CatalogShell({profile}: {profile: CatalogProfile}) {
    const t = useTranslations("catalog");
    const {defs, ready} = useItemDefs();
    const {data} = profile;
    const equipped = data.equipment[CATALOG_CHARACTER.hunter];
    const setCounts = countEquippedSets(equipped, defs);

    useCatalogActions(profile);

    return (
        <EquippedSetsProvider counts={setCounts}>
            <SearchProvider data={data} currentCharacterId={CATALOG_CHARACTER.hunter}>
                {/* Pas d'`ActionRunner` : les actions du catalogue restent en
                    file, rien ne part vers Bungie au nom d'objets inventés. */}
                <MoveDnd selectedCharacterId={CATALOG_CHARACTER.hunter}>
                    <div className="ui-catalog__layout">
                        <nav className="ui-catalog__nav" aria-label={t("navLabel")}>
                            <p className="ui-catalog__brand">{t("title")}</p>
                            <ul>
                                {CATALOG_SECTIONS.map((id) => (
                                    <li key={id}>
                                        <a href={`#${id}`}>{t(`sections.${id}`)}</a>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                        <div className="ui-catalog__content">
                            <header className="ui-catalog__intro">
                                <h1>{t("heading")}</h1>
                                <p>{t("intro")}</p>
                            </header>
                            {ready ? (
                                <CatalogSections profile={profile} setCounts={setCounts}/>
                            ) : (
                                <LoadingIcon/>
                            )}
                        </div>
                    </div>
                </MoveDnd>
            </SearchProvider>
        </EquippedSetsProvider>
    );
}

/**
 * Remplit la file d'actions d'exemples, un par état, et rend la file d'origine
 * en quittant la page.
 *
 * La file est un store global : sans cette restitution, une navigation client
 * vers `/` emporterait les actions fictives, que l'exécuteur de l'application
 * tenterait aussitôt.
 */
function useCatalogActions({byId}: CatalogProfile) {
    useEffect(() => {
        const store = useActionQueue;
        const previous = store.getState();
        store.setState({actions: [], panelOpen: false});
        const q = store.getState();
        const hunter = CATALOG_CHARACTER.hunter;
        const titan = CATALOG_CHARACTER.titan;

        const asItem = (id: string) => {
            const item = byId.get(id)!;
            return {itemHash: item.itemHash, itemInstanceId: id, state: item.state};
        };
        const move = (
            id: string,
            target: Parameters<typeof q.enqueueMove>[0]["target"],
            kind: "toVault" | "fromVault" | "equip" | "pull",
            bucketHash: number,
        ) =>
            q.enqueueMove({
                ...asItem(id),
                target,
                steps: [
                    {
                        kind,
                        itemInstanceId: id,
                        itemHash: byId.get(id)!.itemHash,
                        characterId: hunter,
                        role: "move",
                        bucketHash,
                    },
                ],
            });

        const done = move("v-alone", {kind: "inventory", characterId: hunter}, "fromVault", BUCKET.KineticWeapons);
        const running = move("c-skyburner", {kind: "vault"}, "toVault", BUCKET.EnergyWeapons);
        const failed = move("c-gjallarhorn", {kind: "equipped", characterId: hunter}, "equip", BUCKET.PowerWeapons);
        move("c-ace", {kind: "inventory", characterId: titan}, "toVault", BUCKET.KineticWeapons);
        q.enqueueMove({
            ...asItem("c-mirror"),
            target: {kind: "equipped", characterId: titan},
            steps: [],
            failure: "wrongClass",
        });
        q.enqueueLoadout({
            action: "equip",
            characterId: hunter,
            loadoutIndex: 0,
            colorHash: 1677044030,
            iconHash: 797343696,
            nameHash: 752612096,
            itemInstanceIds: ["c-fatebringer-t", "c-cloudstrike"],
        });

        q.setActionStatus(done, "done");
        q.setActionStatus(running, "running");
        q.setActionStatus(failed, "error", "DestinyItemUniqueEquipRestricted");

        return () => {
            store.setState({actions: previous.actions, panelOpen: false});
        };
    }, [byId]);
}
