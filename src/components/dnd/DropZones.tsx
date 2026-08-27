"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Character } from "@/lib/bungie/use-profile";
import { useMovePlanner } from "@/lib/actions/use-move-planner";
import { BUNGIE_ROOT } from "@/lib/destiny/display";
import type { MovePlan, MoveTarget } from "@/lib/destiny/moves";
import { useCharacterNames } from "@/lib/destiny/use-character-names";
import { ClassIcon } from "../ClassIcon";
import { VaultIcon } from "../icons";
import { DROP_TARGET_ATTR, useDraggedItem, zoneId } from "./MoveDnd";

/**
 * Repères visuels d'un personnage : son symbole de classe au-dessus de la
 * vignette de son emblème.
 *
 * `emblemPath` et non `emblemBackgroundPath` : le second est le bandeau large
 * des onglets, illisible en petit. Celui-ci est le carré de 96 px.
 */
function CharacterMark({ character }: { character: Character }) {
  return (
    <span className="drop-zone__icons">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${BUNGIE_ROOT}${character.emblemPath}`}
        alt=""
        className="drop-zone__emblem"
      />
      {/* Le symbole se pose par-dessus l'emblème, sur un voile qui le détache
          d'une image dont on ne maîtrise pas les couleurs. */}
      <span className="drop-zone__class">
        <ClassIcon classType={character.classType} />
      </span>
    </span>
  );
}

/**
 * Une zone de dépôt.
 *
 * Sa validité vient du planificateur, elle n'est pas devinée : une doctrine ne
 * peut pas rejoindre le coffre, une armure ne s'équipe pas sur une autre
 * classe, et un emplacement plein refuse un objet de plus. Une zone impossible
 * est désactivée et porte son motif — mieux vaut le dire avant le dépôt
 * qu'après le refus de Bungie.
 *
 * Aucun état ici : la mise en avant au survol est faite en CSS, et la
 * destination est lue dans le DOM au relâchement (voir `dropTargetAt`). Le
 * composant ne se rend donc qu'une fois par geste.
 */
function DropZone({
  target,
  label,
  variant,
  plan,
  children,
}: {
  target: MoveTarget;
  label: string;
  variant: "equip" | "inventory" | "vault";
  plan: MovePlan | null;
  /** Repères de la destination, sous le libellé */
  children?: ReactNode;
}) {
  const t = useTranslations("actions.failure");

  const failure = plan && !plan.ok ? plan.failure : null;
  // Un plan vide veut dire « déjà là » : rien à proposer
  const idle = plan?.ok === true && plan.steps.length === 0;
  const disabled = failure !== null || idle;

  const classes = [
    "drop-zone",
    `drop-zone--${variant}`,
    disabled ? "drop-zone--disabled" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      // Lu au relâchement par `dropTargetAt` — d'où la constante partagée
      {...{ [DROP_TARGET_ATTR]: zoneId(target) }}
      data-drop-disabled={disabled ? "true" : undefined}
      title={failure ? t(failure) : undefined}
    >
      <span className="drop-zone__label">{label}</span>
      {children}
      {failure && <span className="drop-zone__reason">{t(failure)}</span>}
    </div>
  );
}

/**
 * Les sept zones de dépôt, révélées pendant un déplacement.
 *
 * Trois calques, tous **enfants directs** de `.inventory-view__body` : un
 * enfant en position absolue d'une grille, à qui l'on donne une position dans
 * cette grille, prend pour bloc conteneur la **zone de grille** elle-même. Le
 * calque du coffre épouse donc exactement la colonne de `.inventory-view__storage`,
 * sans mesure ni valeur approchée à tenir à jour.
 *
 * Ils restent montés en permanence : c'est ce qui permet d'animer la sortie
 * (rien à démonter), et cela retire au passage le travail de montage de
 * l'instant précis où l'utilisateur saisit un objet.
 */
export function DropZones({
  characters,
  selectedCharacterId,
}: {
  characters: readonly Character[];
  selectedCharacterId: string | null;
}) {
  const t = useTranslations("actions.move");
  const tCommon = useTranslations("common");
  const dragged = useDraggedItem();
  const names = useCharacterNames(characters);
  // Un seul planificateur pour les sept zones : il ouvre une souscription
  // IndexedDB, autant ne pas la multiplier par zone.
  const { plan } = useMovePlanner();

  // Le dernier objet saisi survit à la fin du geste, le temps de l'animation de
  // sortie : sans lui, les zones perdraient leur état (grisé, motif de refus)
  // en plein fondu. Ajustement d'état pendant le rendu — React relance le rendu
  // avant de peindre, aucune image intermédiaire n'est affichée.
  const [subject, setSubject] = useState(dragged);
  if (dragged && dragged !== subject) setSubject(dragged);

  // Le personnage affiché en premier : c'est celui que l'utilisateur regarde,
  // et ses deux zones se passent de préciser un nom.
  const ordered = useMemo(
    () => [
      ...characters.filter((c) => c.characterId === selectedCharacterId),
      ...characters.filter((c) => c.characterId !== selectedCharacterId),
    ],
    [characters, selectedCharacterId],
  );

  // Les sept plans en une passe, à la saisie : ~0,13 ms sur un coffre de mille
  // objets. Rien ne les recalcule ensuite, le survol ne coûte plus rien.
  const plans = useMemo(() => {
    if (!subject) return null;
    const targets: MoveTarget[] = [
      { kind: "vault" },
      ...ordered.flatMap((c): MoveTarget[] => [
        { kind: "equipped", characterId: c.characterId },
        { kind: "inventory", characterId: c.characterId },
      ]),
    ];
    return new Map(
      targets.map((target) => [
        zoneId(target),
        plan(subject.itemInstanceId, target),
      ]),
    );
  }, [subject, ordered, plan]);

  const planOf = (target: MoveTarget) => plans?.get(zoneId(target)) ?? null;

  const layer = (name: string) =>
    `drop-zones__${name} drop-zones__layer${
      dragged ? " drop-zones__layer--visible" : ""
    }`;

  return (
    <>
      {/* Assombrit l'inventaire sans le masquer : on reconnaît encore ce qu'on
          survole, ce qui aide à viser. */}
      <div className={layer("scrim")} aria-hidden />

      <div className={layer("characters")}>
        {ordered.map((character, index) => {
          const name = names.get(character.characterId) ?? "";
          const current =
            index === 0 && character.characterId === selectedCharacterId;
          const equip: MoveTarget = {
            kind: "equipped",
            characterId: character.characterId,
          };
          const inventory: MoveTarget = {
            kind: "inventory",
            characterId: character.characterId,
          };

          return (
            <div
              key={character.characterId}
              className={`drop-zones__row${
                current ? " drop-zones__row--current" : ""
              }`}
            >
              <DropZone
                variant="equip"
                target={equip}
                plan={planOf(equip)}
                label={
                  current ? tCommon("equip") : t("equipOn", { character: name })
                }
              >
                <CharacterMark character={character} />
              </DropZone>
              <DropZone
                variant="inventory"
                target={inventory}
                plan={planOf(inventory)}
                label={
                  current
                    ? t("inventoryHere")
                    : t("inventoryOf", { character: name })
                }
              >
                <CharacterMark character={character} />
              </DropZone>
            </div>
          );
        })}
      </div>

      <div className={layer("vault")}>
        <DropZone
          variant="vault"
          target={{ kind: "vault" }}
          plan={planOf({ kind: "vault" })}
          label={t("vault")}
        >
          <span className="drop-zone__icons">
            <VaultIcon className="drop-zone__sigil" />
          </span>
        </DropZone>
      </div>
    </>
  );
}
