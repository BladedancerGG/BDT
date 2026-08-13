"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { manifestDb } from "@/lib/manifest/db";
import type {
  InventoryItemDefinition,
  SandboxPerkDefinition,
} from "./types";

/** DestinyItemPerkVisibility */
const VISIBILITY = { visible: 0, disabled: 1, hidden: 2 } as const;

/**
 * Description d'un plug, en allant la chercher là où elle se trouve vraiment.
 *
 * La plupart des plugs (canons, chargeurs, mods…) la portent directement dans
 * `displayProperties.description`. Mais les **aspects, fragments et attributs
 * d'artéfact l'ont vide** : leur texte vit dans les
 * `DestinySandboxPerkDefinition` référencées par `perks[]`.
 *
 * D'où une cascade, dans cet ordre :
 *  1. la description directe ;
 *  2. les perks `Visible` — c'est le cas courant. Les lignes de statistiques
 *     (« Classe +10 ▲ ») portent la visibilité `Disabled` et sont donc écartées :
 *     elles feraient doublon avec les écarts déjà affichés ;
 *  3. en dernier recours, les perks `Disabled`. Une dizaine d'aspects (Cryoclasme,
 *     As du tir…) n'ont leur texte que là. La visibilité `Hidden` reste exclue :
 *     elle contient les conditions de déverrouillage, pas l'effet.
 *
 * Dans tous les cas, `isDisplayable === false` écarte les perks techniques.
 */
export function usePlugDescription(
  def: InventoryItemDefinition | undefined,
): string | undefined {
  const direct = def?.displayProperties?.description?.trim();

  const fromPerks = useLiveQuery(
    async () => {
      // Inutile d'aller plus loin si la description est déjà là
      if (direct || !def?.perks?.length) return undefined;

      const rows = await manifestDb.definitions.bulkGet(
        def.perks.map(
          (perk) =>
            ["DestinySandboxPerkDefinition", perk.perkHash] as [string, number],
        ),
      );

      /** Textes des perks d'une visibilité donnée. */
      const textsFor = (visibility: number) =>
        def.perks!
          .map((perk, i) => ({
            visibility: perk.perkVisibility ?? VISIBILITY.visible,
            perk: rows[i]?.data as SandboxPerkDefinition | undefined,
          }))
          .filter(
            (entry) =>
              entry.visibility === visibility &&
              entry.perk?.isDisplayable !== false,
          )
          .map((entry) => entry.perk?.displayProperties?.description?.trim())
          .filter((text): text is string => Boolean(text));

      const visible = textsFor(VISIBILITY.visible);
      if (visible.length > 0) return visible.join("\n");

      const disabled = textsFor(VISIBILITY.disabled);
      return disabled.length > 0 ? disabled.join("\n") : undefined;
    },
    [def, direct],
  );

  return direct || fromPerks;
}

/**
 * Résumé d'un plug : la version **courte** de son effet.
 *
 * Priorité inverse de `usePlugDescription` : ici on veut d'abord le texte des
 * `DestinySandboxPerkDefinition`, et jamais celui de `displayProperties`.
 * L'attribut intrinsèque d'une armure exotique porte les deux — « Proximité
 * suffisante » décrit son fonctionnement complet en trois phrases dans sa
 * description directe, quand son perk se contente d'« Extension du chaos
 * prolongée et plus fréquente. » C'est cette seconde forme qui tient sur une
 * ligne d'infobulle.
 *
 * `undefined` quand le manifeste n'en fournit pas : l'appelant n'affiche alors
 * rien, plutôt que de replier sur un pavé de texte.
 */
export function usePlugSummary(
  def: InventoryItemDefinition | undefined,
): string | undefined {
  return useLiveQuery(
    async () => {
      if (!def?.perks?.length) return undefined;

      const rows = await manifestDb.definitions.bulkGet(
        def.perks.map(
          (perk) =>
            ["DestinySandboxPerkDefinition", perk.perkHash] as [string, number],
        ),
      );

      // Seuls les perks visibles et présentables : les autres portent des
      // mécaniques internes, sans texte.
      const texts = def.perks
        .map((perk, i) => ({
          visibility: perk.perkVisibility ?? VISIBILITY.visible,
          perk: rows[i]?.data as SandboxPerkDefinition | undefined,
        }))
        .filter(
          (entry) =>
            entry.visibility === VISIBILITY.visible &&
            entry.perk?.isDisplayable !== false,
        )
        .map((entry) => entry.perk?.displayProperties?.description?.trim())
        .filter((text): text is string => Boolean(text));

      return texts.length > 0 ? texts.join(" ") : undefined;
    },
    [def],
  );
}
