"use client";

import type {CSSProperties} from "react";
import {useTranslations} from "next-intl";
import {useProfile, type Character} from "@/lib/bungie/use-profile";
import {useCharacterNames} from "@/lib/destiny/use-character-names";
import {isAtTarget, locateItem, type MoveTarget} from "@/lib/destiny/moves";
import {useMovePlanner} from "@/lib/actions/use-move-planner";
import type {QueuedItem} from "@/lib/actions/store";
import {BUNGIE_ROOT} from "@/lib/destiny/display";
import {ClassIcon} from "@/components/ClassIcon";
import {VaultIcon} from "@/components/icons";

/**
 * Les déplacements d'un objet, en toutes lettres, dans son infobulle.
 *
 * Le glisser-déposer restait la seule façon de déplacer quoi que ce soit. Au
 * doigt, il demande de viser une zone de dépôt qui n'existe pas sur téléphone —
 * le rail n'en a pas, ses destinations étant sur d'autres pages — et la vue en
 * colonnes de la tablette n'en laisse qu'un mouchoir. Ces boutons donnent la
 * même chose sans geste : ils passent par le MÊME planificateur, et la file
 * d'actions les exécute comme un dépôt.
 *
 * Ils paraissent aussi à la souris : un déplacement qui s'énonce vaut mieux
 * qu'un déplacement qu'il faut deviner, et le geste reste là pour qui le
 * préfère.
 *
 * Rien n'est proposé vers l'endroit où l'objet se trouve déjà, ni vers un
 * endroit que le planificateur refuse : une doctrine ne quitte pas son
 * personnage, un emplacement plein ne reçoit rien. C'est le MÊME plan qui grise
 * les zones de dépôt (voir `DropZones`) — les deux chemins disent donc la même
 * chose, et un bouton sans effet est un bouton de trop.
 */
export function ItemActions({
                                item,
                                onDone,
                            }: {
    item: QueuedItem;
    /**
     * Le déplacement est demandé : l'infobulle n'a plus lieu d'être.
     *
     * Elle recouvre justement l'endroit d'où l'objet part et celui où il
     * arrive — la laisser ouverte, c'était cacher ce qu'on vient de déclencher.
     */
    onDone?: () => void;
}) {
    const t = useTranslations("actions.move");
    const tCommon = useTranslations("common");
    const {plan, enqueue: enqueueMove} = useMovePlanner();

    const enqueue = (queued: QueuedItem, target: MoveTarget) => {
        enqueueMove(queued, target);
        onDone?.();
    };
    const {data} = useProfile();
    const names = useCharacterNames(data?.characters ?? []);

    // Sans profil — la page publique d'un partage — il n'y a ni personnage ni
    // coffre : rien à proposer.
    const located = data ? locateItem(data, item.itemInstanceId) : null;
    if (!data || !located) return null;

    const place = located.place;
    const offered = (target: MoveTarget) =>
        !isAtTarget(place, target) && plan(item.itemInstanceId, target)?.ok === true;

    // —— Deux groupes : équiper, et transférer ————————————————
    //
    // Des emblèmes et non des phrases : quatre destinations en toutes lettres
    // prenaient la moitié d'une infobulle, et le nom d'un personnage ne dit pas
    // mieux que son emblème ce qu'on désigne. Le texte reste, pour le lecteur
    // d'écran et l'infobulle de survol.
    //
    // Les TROIS personnages des deux côtés : équiper ailleurs que sur celui
    // qu'on regarde est un déplacement comme un autre, que le planificateur
    // sait faire en une fois. N'en proposer qu'un obligeait à changer de
    // personnage d'abord.
    const equips = data.characters
        .map((character) => ({
            character,
            target: {
                kind: "equipped" as const,
                characterId: character.characterId,
            },
            label: t("equipOn", {
                character: names.get(character.characterId) ?? "",
            }),
        }))
        .filter(({target}) => offered(target));

    const transfers = data.characters
        .map((character) => ({
            character,
            target: {
                kind: "inventory" as const,
                characterId: character.characterId,
            },
            label: t("toCharacter", {
                character: names.get(character.characterId) ?? "",
            }),
        }))
        .filter(({target}) => offered(target));

    const vault = offered({kind: "vault"});

    // Une doctrine ne bouge pas, un objet déjà partout à sa place non plus : le
    // pied disparaît alors, plutôt que de rester vide sous un filet.
    if (equips.length === 0 && transfers.length === 0 && !vault) return null;

    const characterButton = ({
        character,
        target,
        label,
    }: {
        character: Character;
        target: MoveTarget;
        label: string;
    }) => (
        <button
            key={`${target.kind}:${character.characterId}`}
            type="button"
            className="item-actions__target"
            onClick={() => enqueue(item, target)}
            aria-label={label}
            title={label}
            // L'emblème passe par une variable CSS, comme dans le sélecteur de
            // personnage : c'est une image dont l'adresse vient du profil.
            style={
                {
                    "--emblem-url": `url(${BUNGIE_ROOT}${character.emblemPath})`,
                } as CSSProperties
            }
        >
            <span className="item-actions__emblem" aria-hidden />
            <ClassIcon
                classType={character.classType}
                className="item-actions__symbol"
            />
        </button>
    );

    return (
        <div className="item-actions">
            {equips.length > 0 && (
                <div className="item-actions__group">
                    <span className="item-actions__title">{tCommon("equip")}</span>
                    <div className="item-actions__targets">
                        {equips.map(characterButton)}
                    </div>
                </div>
            )}

            {(transfers.length > 0 || vault) && (
                <div className="item-actions__group">
                    <span className="item-actions__title">{t("transferTo")}</span>
                    <div className="item-actions__targets">
                        {transfers.map(characterButton)}

                        {vault && (
                            <button
                                type="button"
                                className="item-actions__target item-actions__target--vault"
                                onClick={() => enqueue(item, {kind: "vault"})}
                                aria-label={t("vault")}
                                title={t("vault")}
                            >
                                <VaultIcon className="item-actions__symbol" />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
