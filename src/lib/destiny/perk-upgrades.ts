// Ce qu'un instantané d'attributs doit oublier, et ce qu'il doit rattraper.
//
// Deux mouvements inverses autour du même piège : un groupe enregistre des
// hashes de plugs, or l'arme qui les porte **change de pool** quand le joueur
// la façonne, l'améliore ou lui monte un palier. L'API n'expose aucune de ces
// trois opérations ; le groupe ne peut donc que constater l'écart et s'y
// adapter au moment de l'équiper.
//
// Un module **pur**, comme `saved-sockets.ts` : ni React, ni store, ni réseau.
// Ses imports de valeur sont relatifs — voir scripts/checks/README.md.

import type {InventoryItemDefinition} from "./types";
import {SOCKET_CATEGORY} from "./display";
import {isEnhancedPlug} from "./sockets";
import {isCrafted} from "./overlays";
import {INVALID_HASH} from "../loadouts/loadout";

/** Index des sockets d'attributs d'une arme — les colonnes de l'infobulle. */
export function weaponPerkSocketIndexes(
    def: InventoryItemDefinition | undefined,
): number[] {
    return (def?.sockets?.socketCategories ?? [])
        .filter(
            (category) =>
                category.socketCategoryHash === SOCKET_CATEGORY.WEAPON_PERKS,
        )
        .flatMap((category) => category.socketIndexes);
}

/**
 * Les attributs à **enregistrer** pour un objet, une fois l'arme façonnée mise
 * à part.
 *
 * Une arme façonnée n'a qu'un seul attribut par colonne : le joueur l'a choisi
 * au façonnage, et il n'y a rien à y rétablir. Enregistrer ces colonnes n'aurait
 * donc aucun effet utile — mais un effet néfaste bien réel : le hash enregistré
 * devient faux dès le prochain refaçonnage ou la prochaine amélioration, et
 * l'équipement du groupe partait alors demander un attribut que l'arme n'offre
 * plus. Bungie refuse, et le refus s'affiche au milieu d'une séquence qui
 * n'avait aucune raison de la demander.
 *
 * **Seules les colonnes d'attributs sont oubliées.** Mods, revêtement,
 * ornement, pièce maîtresse et armature restent enregistrés : eux se changent à
 * volonté, et c'est justement ce qu'un groupe sert à rétablir.
 *
 * La sentinelle `INVALID_HASH` est ce qui « oublie » : elle signifie « non
 * enregistré, prendre la valeur courante » (voir `savedSockets`), là où un zéro
 * signifierait « socket vide ».
 */
export function recordedPlugs(
    plugItemHashes: readonly number[],
    def: InventoryItemDefinition | undefined,
    state: number | undefined,
): number[] {
    const plugs = [...plugItemHashes];
    if (!isCrafted(state)) return plugs;

    for (const index of weaponPerkSocketIndexes(def)) {
        if (index < plugs.length) plugs[index] = INVALID_HASH;
    }
    return plugs;
}

/**
 * L'attribut réellement équipable aujourd'hui, à la place de celui enregistré.
 *
 * Le cas qui l'impose : un groupe a enregistré « Chargeur glacial » sur une arme
 * ordinaire, puis le joueur l'améliore (façonnage, amélioration, palier 2 ou
 * plus). L'arme n'offre alors **que** la version améliorée de l'attribut, qui
 * porte un **autre hash** — l'insertion de l'ancien part pour un refus net,
 * alors que l'intention du groupe est parfaitement réalisable.
 *
 * Rien dans le manifeste ne relie les deux versions : relevé sur les 700 plugs
 * étiquetés « amélioré », aucune clé commune ne les apparie. Ni les perks de
 * bac à sable — la moitié des familles améliorables (canons, chargeurs, lames…)
 * n'en portent aucun —, ni un quelconque renvoi. Ce qui les apparie vraiment, et
 * sur 684 des 700, c'est le couple **nom + famille de plug** : les deux versions
 * portent le même nom, à la lettre près, dans la même
 * `plugCategoryIdentifier`. La rareté les départage ensuite — voir
 * `isEnhancedPlug`.
 *
 * L'appariement se fait **dans les seules options que l'arme propose
 * aujourd'hui** (`reusablePlugs` de l'instance, composant 310), et non dans le
 * manifeste entier : c'est ce qui le rend sûr. Les homonymes relevés sur le
 * manifeste — revêtements, effets d'apparition de vaisseau, améliorations de
 * Spectre — ne cohabitent jamais avec un attribut d'arme dans un même socket, et
 * aucun n'est de la rareté que `isEnhancedPlug` exige.
 *
 * Trois garde-fous, chacun pour un faux positif :
 *
 *  - **l'attribut enregistré encore disponible ne bouge pas.** C'est le cas
 *    ordinaire, et il court-circuite tout le reste ;
 *  - **un socket sans options connues** (`reusablePlugs` ne couvre que ce que
 *    l'instance porte — les mods d'armure viennent des plug sets du compte) ne
 *    donne lieu à aucune substitution ;
 *  - **un attribut déjà amélioré ne se « réaméliore » pas.** Le mouvement n'a
 *    qu'un sens : une arme ne perd pas son amélioration.
 *
 * Quand rien ne convient, la valeur enregistrée part telle quelle : mieux vaut
 * un refus de Bungie, visible dans le panneau d'actions, qu'une substitution
 * devinée.
 */
export function upgradedPlug(
    saved: number,
    /** Options que l'arme propose pour ce socket, aujourd'hui */
    available: readonly number[] | undefined,
    defOf: (plugItemHash: number) => InventoryItemDefinition | undefined,
): number {
    if (!saved || saved === INVALID_HASH) return saved;
    if (!available || available.length === 0) return saved;
    if (available.includes(saved)) return saved;

    const savedDef = defOf(saved);
    if (!savedDef || isEnhancedPlug(savedDef)) return saved;

    const name = savedDef.displayProperties?.name;
    const category = savedDef.plug?.plugCategoryIdentifier;
    if (!name || !category) return saved;

    const upgraded = available.find((plugItemHash) => {
        const def = defOf(plugItemHash);
        return (
            def?.displayProperties?.name === name &&
            def.plug?.plugCategoryIdentifier === category &&
            isEnhancedPlug(def)
        );
    });

    return upgraded ?? saved;
}
