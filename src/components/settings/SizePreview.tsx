"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {useQueryClient} from "@tanstack/react-query";
import {ItemDefsProvider, type ItemRef} from "@/lib/destiny/item-defs";
import {useDisplayableItems} from "@/lib/destiny/use-displayable-items";
import {useLoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import {useSettings} from "@/lib/settings/store";
import {ItemThumb} from "@/components/ItemThumb";
import {LoadoutSlotTile} from "@/components/loadouts/LoadoutSlotTile";
import type {ProfileData} from "@/lib/bungie/use-profile";
import type {DestinyLoadout} from "@/lib/bungie/profile";

/**
 * Aperçu des trois tailles réglables, sur de vrais objets du compte.
 *
 * Les icônes sont tirées au hasard dans l'inventaire, et les emplacements pris
 * parmi ceux du compte : une taille se juge sur ce qu'on regarde vraiment —
 * un cadre de rareté, un filigrane, un glyphe d'emplacement — pas sur un carré.
 */

/**
 * Un objet tiré, avec ce qui habille sa vignette : l'état (façonné, pièce
 * maîtresse), la version de saison et le palier d'équipement. Sans eux l'aperçu
 * montrerait des icônes nues, plus petites à l'œil que celles des grilles.
 */
interface PreviewRef extends ItemRef {
    state?: number;
    versionNumber?: number;
    gearTier?: number;
}

/** Objets tirés, avant filtrage sur le type : il en faut plus que d'affichés. */
const POOL_SIZE = 24;

/** Vignettes montrées par taille. Trois suffisent à voir la mesure changer. */
const SHOWN = 1;

/**
 * Tire quelques objets du profil, sans remise.
 *
 * Le profil est lu dans le cache de React Query et non par `useProfile` : les
 * paramètres s'ouvrent par-dessus la page, qui l'a déjà chargé, et un aperçu
 * n'a aucune raison de déclencher un appel à Bungie.
 */
function samplePool(profile: ProfileData | undefined): PreviewRef[] {
    if (!profile) return [];
    const all = [
        ...Object.values(profile.equipment).flat(),
        ...Object.values(profile.inventory).flat(),
        ...profile.vault,
    ];
    if (all.length === 0) return [];

    const pool: PreviewRef[] = [];
    const seen = new Set<number>();
    // Bornée en tours et non en réussites : un compte tout neuf peut n'avoir
    // que quelques objets distincts, et la boucle tournerait sans fin.
    for (let i = 0; i < POOL_SIZE * 8 && pool.length < POOL_SIZE; i += 1) {
        const item = all[Math.floor(Math.random() * all.length)];
        if (!item?.itemHash || seen.has(item.itemHash)) continue;
        seen.add(item.itemHash);
        pool.push({
            itemHash: item.itemHash,
            itemInstanceId: item.itemInstanceId,
            state: item.state,
            versionNumber: item.versionNumber,
            // Le palier n'est pas sur le composant d'objet mais sur le détail
            // de son instance — c'est là que toutes les grilles le prennent.
            gearTier: item.itemInstanceId
                ? profile.items[item.itemInstanceId]?.instance?.gearTier
                : undefined,
        });
    }
    return pool;
}

/** Un emplacement d'équipement rempli du compte, s'il en existe un. */
function sampleLoadout(
    profile: ProfileData | undefined,
): DestinyLoadout | undefined {
    const all = Object.values(profile?.loadouts ?? {}).flat();
    const filled = all.filter((loadout) => !isEmptyLoadout(loadout));
    if (filled.length === 0) return undefined;
    return filled[Math.floor(Math.random() * filled.length)];
}

export function SizePreview() {
    const t = useTranslations("settings.appearance");
    const queryClient = useQueryClient();
    const showOrnaments = useSettings((s) => s.showOrnaments);
    const showOriginalOnHover = useSettings((s) => s.showOriginalOnHover);

    const profile = queryClient.getQueryData<ProfileData>(["profile"]);

    // Tirage figé au montage : le renouveler à chaque frappe dans un champ de
    // taille ferait clignoter la ligne, alors qu'on y regarde une dimension.
    const [pool] = useState(() => samplePool(profile));
    const [loadout] = useState(() => sampleLoadout(profile));

    if (pool.length === 0) {
        return <p className="size-preview__empty">{t("previewEmpty")}</p>;
    }

    return (
        <ItemDefsProvider
            items={pool}
            details={profile?.items ?? {}}
            withOrnaments={showOrnaments}
            withOriginalOnHover={showOriginalOnHover}
        >
            <PreviewRow
                pool={pool}
                loadout={loadout}
                labels={{
                    icons: t("iconSize"),
                    vault: t("vaultIconSize"),
                    loadouts: t("loadoutIconSize"),
                }}
            />
        </ItemDefsProvider>
    );
}

/**
 * Le contenu, séparé pour vivre *sous* le fournisseur de définitions : c'est de
 * là que `useDisplayableItems` lit le lot déjà chargé.
 */
function PreviewRow({
                        pool,
                        loadout,
                        labels,
                    }: {
    pool: PreviewRef[];
    loadout: DestinyLoadout | undefined;
    labels: {icons: string; vault: string; loadouts: string};
}) {
    // Le tirage ramène aussi ce que les grilles n'affichent pas (matériaux,
    // consommables, modules) : l'aperçu montre exactement ce qu'elles montrent.
    const displayable = useDisplayableItems(pool);
    // Les objets à palier passent devant. Ils sont minoritaires dans un compte
    // (seul l'équipement récent en porte un) et trois vignettes tirées au hasard
    // n'en montraient presque jamais — or c'est un des habillages dont la
    // lisibilité décide justement du réglage.
    const items = [...displayable]
        .sort((a, b) => Number(!a.gearTier) - Number(!b.gearTier))
        .slice(0, SHOWN);
    // Deux vignettes : l'emplacement tiré et une case libre. Elles n'ont pas la
    // même mesure apparente — le vide n'a que ses marques d'angle — et c'est
    // justement ce qu'on vient juger.
    const identifiers = useLoadoutIdentifiers(loadout ? [loadout] : []);

    return (
        <div className="size-preview">
            <div className="size-preview__group">
                <span className="size-preview__caption">{labels.icons}</span>
                <div className="size-preview__items">
                    {items.map((item) => (
                        <PreviewItem key={item.itemHash} item={item}/>
                    ))}
                </div>
            </div>

            {/* Le coffre suit son propre réglage : redéfinir --item-size sur le
                groupe suffit, `.item` et `.item-thumb` la lisent déjà. */}
            <div className="size-preview__group size-preview__group--vault">
                <span className="size-preview__caption">{labels.vault}</span>
                <div className="size-preview__items">
                    {items.map((item) => (
                        <PreviewItem key={item.itemHash} item={item}/>
                    ))}
                </div>
            </div>

            <div className="size-preview__group">
                <span className="size-preview__caption">{labels.loadouts}</span>
                <div className="size-preview__items">
                    <span className="loadout-slot">
                        <LoadoutSlotTile
                            loadout={loadout}
                            index={0}
                            identifiers={identifiers}
                        />
                    </span>
                    <span className="loadout-slot loadout-slot--empty">
                        <LoadoutSlotTile
                            loadout={undefined}
                            index={1}
                            identifiers={identifiers}
                        />
                    </span>
                </div>
            </div>
        </div>
    );
}

/** Une vignette d'aperçu, dessinée comme dans les grilles. */
function PreviewItem({item}: {item: PreviewRef}) {
    return (
        <span className="item size-preview__item">
            <ItemThumb
                itemHash={item.itemHash}
                itemInstanceId={item.itemInstanceId}
                state={item.state}
                versionNumber={item.versionNumber}
                gearTier={item.gearTier}
            />
        </span>
    );
}
