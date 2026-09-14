"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {useQueryClient} from "@tanstack/react-query";
import {
    ItemDefsProvider,
    useItemDefs,
    type ItemRef,
} from "@/lib/destiny/item-defs";
import {useEquippedPlugs} from "@/lib/destiny/use-equipped-plugs";
import {useDisplayableItems} from "@/lib/destiny/use-displayable-items";
import {useLoadoutIdentifiers} from "@/lib/loadouts/use-loadout-identifiers";
import {isEmptyLoadout} from "@/lib/loadouts/loadout";
import {useSettings} from "@/lib/settings/store";
import {ItemThumb} from "@/components/ItemThumb";
import {PlugIcon} from "@/components/tooltip/PlugIcon";
import {LoadoutSlotTile} from "@/components/loadouts/LoadoutSlotTile";
import type {ProfileData} from "@/lib/bungie/use-profile";
import type {DestinyItemComponent, DestinyLoadout} from "@/lib/bungie/profile";
import type {EquippedSetCounts} from "@/lib/destiny/set-bonus";

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
 * Aucun bonus d'ensemble dans l'aperçu : on n'y montre pas la panoplie, juste
 * deux icônes. Référence stable — une Map neuve à chaque rendu relancerait la
 * lecture Dexie sans fin.
 */
const NO_SET_COUNTS: EquippedSetCounts = new Map();

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

/**
 * L'équipement porté d'un personnage, d'où l'aperçu tire ses plugs.
 *
 * Tout l'équipement et non un objet : les attributs ronds viennent des armes,
 * les mods carrés des armures, et il faut donc les deux côtés pour espérer un
 * exemplaire de chaque forme.
 */
function sampleEquipped(profile: ProfileData | undefined): DestinyItemComponent[] {
    const sets = Object.values(profile?.equipment ?? {}).filter(
        (list) => list.length > 0,
    );
    return sets[0] ?? [];
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
    const [equipped] = useState(() => sampleEquipped(profile));

    if (pool.length === 0) {
        return <p className="size-preview__empty">{t("previewEmpty")}</p>;
    }

    return (
        <ItemDefsProvider
            // L'équipement porté rejoint le lot : `useEquippedPlugs` lit les
            // définitions d'objets ici, et sans elles il ne rendrait aucune
            // icône de plug.
            items={[...pool, ...equipped]}
            details={profile?.items ?? {}}
            withOrnaments={showOrnaments}
            withOriginalOnHover={showOriginalOnHover}
        >
            <PreviewRow
                pool={pool}
                loadout={loadout}
                equipped={equipped}
                details={profile?.items ?? {}}
                labels={{
                    icons: t("iconSize"),
                    vault: t("vaultIconSize"),
                    loadouts: t("loadoutIconSize"),
                    plugs: t("plugSize"),
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
                        equipped,
                        details,
                        labels,
                    }: {
    pool: PreviewRef[];
    loadout: DestinyLoadout | undefined;
    equipped: DestinyItemComponent[];
    details: ProfileData["items"];
    labels: {icons: string; vault: string; loadouts: string; plugs: string};
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
    // Les deux formes de plug, prises sur l'équipement porté plutôt que sur des
    // hashes écrits en dur : c'est la définition du plug qui décide de sa forme
    // (`PlugChip.square`), et un hash deviné se serait tu le jour où il change.
    const {defs} = useItemDefs();
    const chips = [
        ...useEquippedPlugs(equipped, details, defs, NO_SET_COUNTS).values(),
    ].flat(2);
    const circle = chips.find((chip) => !chip.square);
    const square = chips.find((chip) => chip.square);

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

            {/* Attributs et mods : une icône ronde et une carrée, les deux
                formes que le réglage commande. */}
            {(circle || square) && (
                <div className="size-preview__group">
                    <span className="size-preview__caption">{labels.plugs}</span>
                    <div className="size-preview__items size-preview__items--plugs">
                        {circle && (
                            <PlugIcon
                                hash={circle.hash}
                                table={circle.table}
                                markEnhanced={circle.markEnhanced}
                                state={"equipped"}
                            />
                        )}
                        {square && <PlugIcon hash={square.hash} square/>}
                    </div>
                </div>
            )}
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
