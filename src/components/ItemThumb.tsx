"use client";

import type { CSSProperties } from "react";
import {
  useSharedDefinition,
  useSharedIconDefinition,
  useSharedItemConstants,
  useOrnamentIcon,
  useOriginalOnHover,
} from "@/lib/destiny/item-defs";
import {
  isMasterwork,
  itemOverlays,
  ornamentBackgroundPath,
} from "@/lib/destiny/overlays";
import { bestIconPath, tierClassName } from "@/lib/destiny/icons";
import { isSubclass } from "@/lib/destiny/subclass";
import { AmmoIcon, BorderIcon, hasAmmoIcon } from "@/components/icons";
import { BUNGIE_ROOT, ITEM_TYPE } from "@/lib/destiny/display";

export interface ItemThumbProps {
  itemHash: number;
  /** Nécessaire pour retrouver l'ornement équipé sur cette instance */
  itemInstanceId?: string;
  /** Masque ItemState (pièce maîtresse, façonné, amélioré…) */
  state?: number;
  /** Version de l'objet, pour choisir le bon filigrane de saison */
  versionNumber?: number;
  /** Palier d'équipement (1–5) */
  gearTier?: number;
  /**
   * L'objet est-il celui équipé de son emplacement ? Seules ces armes affichent
   * leur type de munitions, comme le fait le jeu : sur toute une grille, le
   * glyphe n'apprendrait rien (un emplacement n'accueille qu'un type).
   */
  equipped?: boolean;
}

/**
 * Vignette d'un objet : son icône surmontée de ses habillages.
 *
 * Filigrane de saison, palier d'équipement et marquages « façonné » /
 * « amélioré » sont tous des images 96×96 fournies par le manifeste, qui
 * portent déjà leur propre positionnement — on les empile donc simplement.
 */
export function ItemThumb({
  itemHash,
  itemInstanceId,
  state,
  versionNumber,
  gearTier,
  equipped,
  className,
}: ItemThumbProps & { className?: string }) {
  // Servies par ItemDefsProvider : une seule requête groupée pour tout
  // l'inventaire, au lieu de deux par vignette.
  const def = useSharedDefinition(itemHash);
  const iconDef = useSharedIconDefinition(itemHash);
  const constants = useSharedItemConstants();
  // Vide si l'option « afficher les ornements » est désactivée
  const ornamentIcon = useOrnamentIcon(itemInstanceId);
  const originalOnHover = useOriginalOnHover();

  // PNG détouré quand le manifeste en fournit un, sinon repli sur le JPEG
  // (qui, lui, a le fond de rareté incrusté dans l'image).
  const baseIcon = bestIconPath(def, iconDef);
  const icon = ornamentIcon ?? baseIcon;
  const name = def?.displayProperties?.name ?? "";

  // Un ornement masque l'apparence d'origine : on la rétablit au survol, en
  // superposant l'icône de base. Elle est montée en permanence (et non au
  // survol) pour que le navigateur l'ait déjà chargée quand le curseur arrive.
  // Réservé aux armures : sur une arme, l'ornement ne change que l'apparence
  // d'un modèle qu'on reconnaît déjà à son nom, l'échange n'apprend rien.
  const originalIcon =
    originalOnHover &&
    def?.itemType === ITEM_TYPE.Armor &&
    ornamentIcon &&
    baseIcon &&
    baseIcon !== ornamentIcon
      ? baseIcon
      : undefined;

  // Le fond de rareté n'est utile que pour les icônes détourées : le JPEG le
  // porte déjà. Il est fourni par le SCSS via une classe de rareté, sauf pour
  // les objets « holofoil » qui reçoivent une image animée à la place.
  const tierType = def?.inventory?.tierType;
  const holofoil = def?.isHolofoil
    ? constants?.holofoil900BackgroundOverlayPath
    : undefined;

  // Les icônes d'ornement sont détourées : le jeu leur ajoute un fond, choisi
  // selon la rareté. Il se place DERRIÈRE l'image.
  const background = ornamentIcon
    ? ornamentBackgroundPath(constants, tierType)
    : undefined;

  // Calques ordonnés du fond vers le dessus : halo de pièce maîtresse,
  // filigrane, palier, fond et marquage façonné/amélioré, puis le cadre doré
  // de pièce maîtresse (voir itemOverlays).
  const overlays = itemOverlays({
    def,
    constants,
    state,
    versionNumber,
    gearTier,
  });

  // Type de munitions de l'arme équipée. Il occupe le coin bas droit, celui où
  // le marquage façonné / amélioré est désormais renvoyé : quand les deux sont
  // là, le marquage se décale d'une case vers la gauche.
  const ammoType =
    equipped && def?.itemType === ITEM_TYPE.Weapon
      ? def.equippingBlock?.ammoType
      : undefined;
  const ammo = hasAmmoIcon(ammoType);
  const marker = overlays.some((overlay) => overlay.kind === "marker");

  // Une pièce maîtresse reçoit son cadre doré depuis le manifeste (dernier
  // calque de `overlays`) ; les autres objets prennent le cadre blanc local.
  // Les doctrines en sont exemptées : leur vignette est un losange ou un
  // cercle, un cadre carré n'aurait aucun sens autour.
  const subclass = isSubclass(def);
  const regularBorder = !subclass && !isMasterwork(state);

  const classes = [
    "item-thumb",
    // Les doctrines ont leur propre cadre : pas de fond de rareté
    subclass ? null : `item-thumb--tier-${tierClassName(tierType)}`,
    holofoil ? "item-thumb--holofoil" : null,
    originalIcon ? "item-thumb--ornamented" : null,
    // Dégradé du coin bas droit : il accompagne le marquage façonné / amélioré,
    // en remplacement de l'image de fond du manifeste (ancrée à gauche).
    marker ? "item-thumb--marked" : null,
    // Marquage décalé d'une case : l'icône de munitions occupe le coin
    ammo && marker ? "item-thumb--marker-shifted" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      // L'URL du fond holofoil vient du manifeste, pas du SCSS
      style={
        holofoil
          ? ({
              "--holofoil-bg": `url(${BUNGIE_ROOT}${holofoil})`,
            } as CSSProperties)
          : undefined
      }
    >
      {background && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${BUNGIE_ROOT}${background}`}
          alt=""
          className="item-thumb__background"
        />
      )}
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${BUNGIE_ROOT}${icon}`}
          alt={name}
          className="item-thumb__img"
          loading="lazy"
        />
      )}
      {originalIcon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${BUNGIE_ROOT}${originalIcon}`}
          alt=""
          className="item-thumb__original"
          loading="lazy"
        />
      )}
      {marker && (
        // Dégradé rouge du coin bas droit, sous le marquage façonné / amélioré.
        // Sa place dans le DOM fait tout : au-dessus de l'icône, sous le cadre
        // doré des pièces maîtresses qui ferme la pile.
        <span className="item-thumb__marker-glow" aria-hidden />
      )}
      {overlays.map((overlay, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${overlay.path}-${i}`}
          src={`${BUNGIE_ROOT}${overlay.path}`}
          alt=""
          className={`item-thumb__overlay${
            overlay.kind === "marker" ? " item-thumb__overlay--marker" : ""
          }`}
        />
      ))}
      {ammo && (
        // Icône locale, contrairement à tous les calques ci-dessus : le
        // manifeste n'en porte aucune pour les types de munitions.
        <AmmoIcon ammoType={ammoType} className="item-thumb__ammo" />
      )}
      {regularBorder && (
        // Cadre des objets ordinaires, pendant du cadre doré des pièces
        // maîtresses. Il n'existe pas côté Bungie : c'est une icône locale, et
        // sa place en fin de pile la met au-dessus des calques du manifeste —
        // comme le faisait le ::after qu'elle remplace.
        //
        // `preserveAspectRatio="none"` reproduit l'étirement de l'ancien
        // `background-size: 100% 100%` : le trait suit l'échelle de la vignette.
        <BorderIcon className="item-thumb__border" preserveAspectRatio="none" />
      )}
    </span>
  );
}
