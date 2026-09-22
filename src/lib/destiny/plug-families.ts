// Familles de plugs — le `plugCategoryIdentifier` du manifeste.
//
// Module pur : ni React, ni réseau, ni store. Il ne connaît que des chaînes.

/**
 * Le sélecteur d'un socket mérite-t-il un champ de recherche ?
 *
 * Seules les familles qui se comptent en **centaines** en ont besoin : ailleurs
 * — attributs d'arme, mods, aspects, fragments — les options tiennent en deux
 * rangées, et un champ de plus ne fait que repousser la grille et, sur
 * téléphone, appeler le clavier.
 *
 * ⚠ Les identifiants sont RELEVÉS dans le manifeste, jamais devinés. Comptés
 * sur la version française, par type d'objet affiché :
 *
 *   Revêtement             → `shader`                        717
 *   Interaction            → `emote`                         699
 *   Projection de Spectre  → `hologram`                      298
 *   Effet de téléportation → `ship.spawnfx`                  201
 *   Ornement universel     → `armor_skins_<classe>_<zone>`   ~125 par emplacement
 *
 * Le troisième est le piège : rien dans `hologram` n'annonce un spectre, et
 * aucune des familles `ghosts.*` du manifeste ne porte les projections — ce
 * sont les mods du spectre. Chercher « projection » ou « ghost » ne donne rien.
 */
const SEARCHABLE_FAMILIES: readonly string[] = [
    "shader",
    "emote",
    "hologram",
    "ship.spawnfx",
];

/**
 * Les ornements d'armure sont découpés par classe et par emplacement
 * (`armor_skins_titan_head`, `armor_skins_warlock_chest`…) : vingt-et-une
 * familles pour une même idée, d'où le préfixe plutôt que la liste.
 */
const SEARCHABLE_PREFIX = "armor_skins_";

export function isSearchablePlugFamily(identifier: string | undefined): boolean {
    if (!identifier) return false;
    return (
        SEARCHABLE_FAMILIES.includes(identifier) ||
        identifier.startsWith(SEARCHABLE_PREFIX)
    );
}
