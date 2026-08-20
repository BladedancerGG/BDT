// Icônes locales — celles que le manifeste n'expose pas (types de munitions et
// d'armes, symboles de classe, sigils du coffre et du Courrier, animation de
// chargement, liseré des attributs améliorés).
//
// Ce sont des composants qui rendent le SVG **en ligne**, et non des fichiers
// servis par `<img>`. La différence n'est pas cosmétique : un SVG chargé par
// `<img>` est un document isolé, où `currentColor` se résout contre sa propre
// racine et jamais contre la page. C'est ce qui imposait auparavant de poser les
// silhouettes monochromes en masque CSS (une variable par appelant, et un
// fichier de plus à télécharger). En ligne, elles héritent directement de la
// couleur de texte, et le CSS peut atteindre n'importe lequel de leurs calques.
//
// Chaque icône accepte les attributs d'un `<svg>` : la taille et la couleur
// restent au CSS, aucune n'est figée dans le fichier.
//
// Les trois familles à choix multiple passent par un aiguillage
// (`AmmoIcon`, `WeaponTypeIcon`, `ClassSymbol`) plutôt que par une table
// renvoyant le composant à monter : renvoyer un composant depuis une fonction
// appelée pendant le rendu revient à en créer un à chaque passe, ce que
// `react-hooks/static-components` refuse.

export { AmmoIcon, hasAmmoIcon } from "./ammo/AmmoIcon";
export { WeaponTypeIcon } from "./weapon-types/WeaponTypeIcon";
export { ClassSymbol } from "./classes/ClassSymbol";
export { default as LoadingIcon } from "./general/LoadingIcon";
export { default as VaultIcon } from "./inventory/VaultIcon";
export { default as PostmasterIcon } from "./inventory/PostmasterIcon";
export { default as LoadoutsIcon } from "./inventory/LoadoutsIcon";
export { default as BorderIcon } from "./ui/BorderIcon";
export { default as EnhancedPerkIcon } from "./ui/EnhancedPerkIcon";
