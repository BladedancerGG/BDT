"use client";

import { useTranslations } from "next-intl";
import { useDefinition } from "@/lib/manifest/use-definition";
import type {
  InventoryItemDefinition,
  StatDefinition,
} from "@/lib/destiny/types";
import { plugStatModifiers } from "@/lib/destiny/plug-stats";
import {
  usePlugDescription,
  usePlugPerks,
} from "@/lib/destiny/use-plug-description";
import { isExoticCatalystPlug } from "@/lib/destiny/sockets";
import { fragmentSlots } from "@/lib/destiny/subclass";
import { BUNGIE_ROOT } from "@/lib/destiny/display";
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
 * Les perks d'un **catalyseur d'exotique** sont détaillés sous sa description :
 * celle-ci ne dit que « passe l'arme en pièce maîtresse », l'effet réel vivant
 * dans ses perks. Le catalyseur n'a pas à être achevé pour cela — c'est
 * justement avant de l'appliquer qu'on veut savoir ce qu'il apporte, que
 * l'infobulle soit celle de l'emplacement ou d'une option du sélecteur.
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
  const tCommon = useTranslations("common");
  const def = useDefinition<InventoryItemDefinition>(table, hash);
  const modifiers = plugStatModifiers(def);
  // Un aspect ouvre deux ou trois emplacements de fragments. Le jeu l'annonce,
  // le manifeste ne le met dans aucune description : sans cette ligne, choisir
  // entre deux aspects se faisait sans savoir ce qu'on y gagnait.
  const slots = fragmentSlots(def);
  // Aspects, fragments et attributs d'artéfact ont une description vide :
  // le hook va la chercher dans leurs perks associés.
  const description = usePlugDescription(def);
  // La définition n'est passée que pour un catalyseur : sans ce filtre, chaque
  // infobulle de mod ouvrirait une lecture Dexie de plus pour rien.
  const plugPerks = usePlugPerks(isExoticCatalystPlug(def) ? def : undefined);

  if (!def) return null;

  const name = def.displayProperties?.name;
  const type = typeLabel ?? def.itemTypeDisplayName;

  return (
    <div className="plug-tooltip">
      <div className="plug-tooltip__header">
        <span className="plug-tooltip__name">{name}</span>
        {type && <span className="plug-tooltip__type">{type}</span>}
      </div>

      {(description ||
        slots > 0 ||
        modifiers.length > 0 ||
        plugPerks.length > 0) && (
        <div className="plug-tooltip__body">
          {description && (
            <p className="plug-tooltip__description">{description}</p>
          )}
          {plugPerks.length > 0 && (
            <ul className="plug-tooltip__perks">
              {plugPerks.map((perk) => (
                <li key={perk.perkHash} className="plug-tooltip__perk">
                  {perk.icon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${BUNGIE_ROOT}${perk.icon}`}
                      alt=""
                      className="plug-tooltip__perk-icon"
                    />
                  )}
                  <div className="plug-tooltip__perk-text">
                    <span className="plug-tooltip__perk-name">{perk.name}</span>
                    <p className="plug-tooltip__perk-description">
                      {perk.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {slots > 0 && (
            <p className="plug-tooltip__slots">
              {t("fragmentSlots", { count: slots })}
            </p>
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
            ? tCommon("equip")
            : t("browsePlugs")}
        </p>
      )}
    </div>
  );
}
