"use client";

import { useTranslations } from "next-intl";
import { useDefinition } from "@/lib/manifest/use-definition";
import type {
  EquipableItemSetDefinition,
  InventoryItemDefinition,
} from "@/lib/destiny/types";
import { itemSetHash, useEquippedSetCount } from "@/lib/destiny/set-bonus";
import { PlugIcon } from "./PlugIcon";

/**
 * Bonus d'ensemble d'une armure, présentés comme les perks d'arme : une rangée
 * d'icônes, sans libellé.
 *
 * Un perk est marqué équipé dès que le personnage affiché porte assez de pièces
 * du même ensemble (2 puis 4). Le compte vient du contexte : l'infobulle d'un
 * objet ne connaît pas, seule, le reste de l'équipement.
 *
 * Les perks sont dans l'ordre croissant du nombre de pièces requis, si bien que
 * la première icône correspond au palier de 2 et la seconde à celui de 4.
 */
export function SetBonus({ def }: { def: InventoryItemDefinition }) {
  const t = useTranslations("item");
  const setHash = itemSetHash(def);
  const set = useDefinition<EquipableItemSetDefinition>(
    "DestinyEquipableItemSetDefinition",
    setHash,
  );
  const equippedCount = useEquippedSetCount(setHash);

  if (!setHash || !set?.setPerks?.length) return null;

  const perks = [...set.setPerks].sort(
    (a, b) => a.requiredSetCount - b.requiredSetCount,
  );

  return (
    <div className="socket-section">
      <span className="socket-section__title">
        {set.displayProperties?.name}
      </span>
      <div className="socket-section__row">
        {perks.map((perk) => (
          <PlugIcon
            key={perk.sandboxPerkHash}
            hash={perk.sandboxPerkHash}
            table="DestinySandboxPerkDefinition"
            // Les perks d'ensemble n'ont pas d'itemTypeDisplayName : on compose
            // le type nous-mêmes, ex. « Septième Séraphin | 2 pièces »
            typeLabel={`${set.displayProperties?.name} | ${t("setPieces", {
              count: perk.requiredSetCount,
            })}`}
            state={
              equippedCount >= perk.requiredSetCount ? "equipped" : "available"
            }
          />
        ))}
      </div>
    </div>
  );
}
