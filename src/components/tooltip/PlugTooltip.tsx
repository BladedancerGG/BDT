"use client";

import { useTranslations } from "next-intl";
import { useDefinition } from "@/lib/manifest/use-definition";
import type {
  InventoryItemDefinition,
  StatDefinition,
} from "@/lib/destiny/types";
import { plugStatModifiers } from "@/lib/destiny/plug-stats";
import { usePlugDescription } from "@/lib/destiny/use-plug-description";
import { DestinySymbol } from "@/components/DestinySymbol";

/** Une ligne « +10 Stabilité » / « -5 Maniement ». */
function StatLine({ statHash, value }: { statHash: number; value: number }) {
  const def = useDefinition<StatDefinition>("DestinyStatDefinition", statHash);
  const name = def?.displayProperties?.name;
  if (!name) return null;

  return (
    <li
      className={`plug-tooltip__stat${
        value < 0 ? " plug-tooltip__stat--negative" : ""
      }`}
    >
      <span className="plug-tooltip__stat-value">
        {value > 0 ? `+${value}` : value}
      </span>
      <span className="plug-tooltip__stat-name">{name}</span>
    </li>
  );
}

/**
 * Infobulle d'un attribut, mod ou capacité : nom et type en en-tête,
 * description et écarts de statistiques dans le corps.
 *
 * Le type vient de `itemTypeDisplayName`, déjà localisé par le manifeste et
 * plus précis qu'une catégorisation maison (« Canon », « Mod d'arme amélioré »,
 * « Mod d'armure de jambes »…). `typeLabel` permet de le remplacer là où le
 * manifeste n'en fournit pas — c'est le cas des bonus d'ensemble.
 *
 * `equippable` ajoute en pied la marche à suivre pour équiper l'attribut. C'est
 * une indication, pas un bouton : l'infobulle se ferme dès que le curseur
 * quitte l'icône, elle n'est pas atteignable à la souris. Le clic se fait sur
 * l'icône.
 *
 * `browseLabel` remplace ce pied lorsque le clic n'équipe pas mais **ouvre le
 * sélecteur** du socket — les mods, revêtements et ornements sont trop nombreux
 * pour être proposés dans l'infobulle elle-même.
 */
export function PlugTooltip({
  hash,
  table = "DestinyInventoryItemDefinition",
  typeLabel,
  equippable = false,
  browseLabel,
}: {
  hash: number;
  table?: string;
  typeLabel?: string;
  equippable?: boolean;
  browseLabel?: string;
}) {
  const t = useTranslations("item");
  const def = useDefinition<InventoryItemDefinition>(table, hash);
  const modifiers = plugStatModifiers(def);
  // Aspects, fragments et attributs d'artéfact ont une description vide :
  // le hook va la chercher dans leurs perks associés.
  const description = usePlugDescription(def);

  if (!def) return null;

  const name = def.displayProperties?.name;
  const type = typeLabel ?? def.itemTypeDisplayName;

  return (
    <div className="plug-tooltip">
      <div className="plug-tooltip__header">
        <span className="plug-tooltip__name">{name}</span>
        {type && <span className="plug-tooltip__type">{type}</span>}
      </div>

      {(description || modifiers.length > 0) && (
        <div className="plug-tooltip__body">
          {description && (
            <p className="plug-tooltip__description">{description}</p>
          )}
          {modifiers.length > 0 && (
            <ul className="plug-tooltip__stats">
              {modifiers.map((modifier) => (
                <StatLine
                  key={modifier.statHash}
                  statHash={modifier.statHash}
                  value={modifier.value}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {(equippable || browseLabel) && (
        <p className="plug-tooltip__action">
          <DestinySymbol name="mouseLeft" className="plug-tooltip__action-key" />
          {equippable
            ? t("equipPerk")
            : t("browsePlugs")}
        </p>
      )}
    </div>
  );
}
