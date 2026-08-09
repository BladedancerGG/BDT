"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { DestinyItemComponent } from "@/lib/bungie/profile";
import type { ItemDetail } from "@/lib/bungie/item-components";
import { useSettings } from "@/lib/settings/store";
import { useItemDefs } from "./item-defs";
import { useSortedItems } from "./use-sorted-items";
import { useGroupDefs } from "./use-group-defs";
import { AMMO_TYPE, groupItems, type BucketSection } from "./grouping";

/**
 * Objets d'une liste, triés puis découpés en sections d'emplacement et en
 * sous-groupes.
 *
 * Les deux réglages se composent dans cet ordre : le tri du joueur s'applique
 * d'abord à toute la liste, le regroupement se contente ensuite de la
 * redistribuer sans en changer l'ordre interne.
 */
export function useGroupedItems(
  items: DestinyItemComponent[],
  details: Record<string, ItemDetail>,
): BucketSection[] {
  const sorted = useSortedItems(items, details);
  const { defs, traits } = useItemDefs();
  const { bucketNames, damageTypes, classNames } = useGroupDefs();
  const weapon = useSettings((s) => s.weaponGrouping);
  const armor = useSettings((s) => s.armorGrouping);

  const t = useTranslations("inventory");

  // Les seuls libellés que le manifeste ne fournit pas : DestinyAmmunitionType
  // n'a pas de table de définitions, ce sont des chaînes d'interface.
  //
  // La dépendance porte sur les chaînes et non sur `t` : rien ne garantit
  // l'identité de celle-ci d'un rendu à l'autre, et une carte reconstruite à
  // chaque rendu relancerait tout le regroupement — donc une re-mesure de la
  // grille virtualisée, donc un rendu, en boucle.
  const primary = t("ammo.primary");
  const special = t("ammo.special");
  const heavy = t("ammo.heavy");
  const otherLabel = t("otherGroup");

  const ammoNames = useMemo(
    () =>
      new Map<number, string>([
        [AMMO_TYPE.Primary, primary],
        [AMMO_TYPE.Special, special],
        [AMMO_TYPE.Heavy, heavy],
      ]),
    [primary, special, heavy],
  );

  return useMemo(
    () =>
      groupItems(
        sorted,
        {
          defs,
          details,
          traits,
          bucketNames,
          damageTypes,
          classNames,
          ammoNames,
          otherLabel,
        },
        { weapon, armor },
      ),
    [
      sorted,
      defs,
      details,
      traits,
      bucketNames,
      damageTypes,
      classNames,
      ammoNames,
      otherLabel,
      weapon,
      armor,
    ],
  );
}
