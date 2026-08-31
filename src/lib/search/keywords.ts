// Vocabulaire de la recherche : les mots-clés que l'utilisateur tape, et ce
// qu'ils désignent dans les données du jeu.
//
// Tout est en anglais, syntaxe de Destiny Item Manager comprise : c'est le
// vocabulaire que les joueurs connaissent, et il ne dépend pas de la langue du
// manifeste. La normalisation retire accents, espaces et ponctuation :
// `stat:reload speed`, `stat:reload-speed` et `stat:reloadspeed` désignent la
// même statistique, et `foundry:tex-mechanica` la même fonderie que
// `foundry:texmechanica`.
//
// Les hashes viennent du manifeste (version 244213), relevés dans
// DestinyStatDefinition et DestinyDamageTypeDefinition — jamais devinés.

/**
 * Forme canonique d'un mot-clé : minuscules, sans accents ni ponctuation.
 *
 * `NFD` sépare les lettres de leurs diacritiques, que la plage `\u0300-\u036f`
 * élimine ensuite — « portée » et « portee » deviennent la même clé.
 */
export function normalizeKeyword(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9<>=!.]/g, "");
}

/** Minuscules et sans accents, mais espaces conservés — pour les recherches textuelles. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// —— Statistiques ————————————————————————————————————————————————

/** Somme des six statistiques d'armure — `stat:total:>=70`. */
export const STAT_TOTAL = "total";

/**
 * Statistiques adressables par leur nom.
 *
 * Les six statistiques d'armure (Edge of Fate) d'abord, puis celles des armes.
 */
export const STAT_KEYWORDS: Readonly<Record<string, number>> = {
  // —— Armures ——
  health: 392767087,
  melee: 4244567218,
  grenade: 1735777505,
  super: 144602215,
  class: 1943323491,
  weapons: 2996146975,

  // —— Armes ——
  impact: 4043523819,
  range: 1240592695,
  accuracy: 1591432999,
  precision: 1591432999,
  blastradius: 3614673599,
  velocity: 2523465841,
  persistence: 3085395333,
  shieldduration: 1842278586,
  stability: 155624089,
  handling: 943549884,
  equipspeed: 943549884,
  reload: 4188031367,
  reloadspeed: 4188031367,
  aimassist: 1345609583,
  aimassistance: 1345609583,
  targetacquisition: 1345609583,
  airborne: 2714457168,
  airborneeffectiveness: 2714457168,
  efficaciteaerienne: 2714457168,
  zoom: 3555269338,
  ammogeneration: 1931675084,
  ammogen: 1931675084,
  generationdemunitions: 1931675084,
  rpm: 4284893193,
  rof: 4284893193,
  roundsperminute: 4284893193,
  drawtime: 447667954,
  chargetime: 2961396640,
  charge: 2961396640,
  heat: 3481294762,
  heatgen: 3481294762,
  heatgenerated: 3481294762,
  cooling: 4006394725,
  coolingefficiency: 4006394725,
  ventspeed: 602570185,
  recoil: 2715839340,
  recoildirection: 2715839340,
  magazine: 3871231066,
  mag: 3871231066,

  // —— Épées et glaives ——
  swingspeed: 2837207746,
  chargerate: 3022301683,
  guardresistance: 209426660,
  guardendurance: 3736848092,
  guardefficiency: 2762071195,
  ammocapacity: 925767036,
};

/** Les six statistiques additionnées par `stat:total`. */
export const ARMOR_STAT_HASHES: readonly number[] = [
  392767087, // Santé
  4244567218, // Mêlée
  1735777505, // Grenade
  144602215, // Super
  1943323491, // Classe
  2996146975, // Armes
];

// —— Types de dégâts (DestinyDamageType) ————————————————————————

export const DAMAGE_KEYWORDS: Readonly<Record<string, number>> = {
  kinetic: 1,
  arc: 2,
  solar: 3,
  void: 4,
  stasis: 6,
  strand: 7,
};

/**
 * Familles d'éléments — `is:light` et `is:dark`.
 *
 * Le cinétique n'est ni l'un ni l'autre : il n'a pas d'élément du tout. C'est
 * aussi le découpage de DIM.
 */
export const DAMAGE_FAMILIES: Readonly<Record<string, readonly number[]>> = {
  light: [2, 3, 4],
  dark: [6, 7],
};

// —— Raretés (tierType) ————————————————————————————————————————

export const TIER_KEYWORDS: Readonly<Record<string, number>> = {
  basic: 2,
  white: 2,
  common: 3,
  uncommon: 3,
  green: 3,
  rare: 4,
  blue: 4,
  legendary: 5,
  purple: 5,
  exotic: 6,
  yellow: 6,
};

// —— Classes (DestinyClass) ————————————————————————————————————

export const CLASS_KEYWORDS: Readonly<Record<string, number>> = {
  titan: 0,
  hunter: 1,
  warlock: 2,
};

// —— Types de munitions (DestinyAmmunitionType) ————————————————

export const AMMO_KEYWORDS: Readonly<Record<string, number>> = {
  primary: 1,
  special: 2,
  heavy: 3,
};

// —— Types d'objets (DestinyItemSubType) ————————————————————————
//
// Le sous-type est déjà porté par la définition, contrairement aux catégories
// d'objets qui demanderaient une table de plus : il couvre à lui seul les types
// d'armes et les pièces d'armure.

export const SUBTYPE_KEYWORDS: Readonly<Record<string, number>> = {
  autorifle: 6,
  shotgun: 7,
  machinegun: 8,
  lmg: 8,
  handcannon: 9,
  rocketlauncher: 10,
  fusionrifle: 11,
  sniperrifle: 12,
  pulserifle: 13,
  scoutrifle: 14,
  sidearm: 17,
  sword: 18,
  linearfusionrifle: 22,
  lfr: 22,
  grenadelauncher: 23,
  submachinegun: 24,
  submachine: 24,
  smg: 24,
  tracerifle: 25,
  bow: 31,
  glaive: 33,
  helmet: 26,
  gauntlets: 27,
  chest: 28,
  chestarmor: 28,
  leg: 29,
  legarmor: 29,
  classitem: 30,
};

// —— Fonderies (traitIds) ————————————————————————————————————————

/**
 * Fonderie d'une arme — `foundry:hakke`.
 *
 * Elle vit dans `traitIds` (« foundry.hakke »), et nulle part ailleurs :
 * relevé sur le manifeste (version 244213), 1 129 armes en portent un. C'est
 * une chaîne stable et indépendante de la langue, contrairement au nom de la
 * fonderie affiché dans la description.
 *
 * `field_forged` et `fotc` (« Forgé sur le terrain », Fonderie de la Cité)
 * n'ont pas de mot-clé chez DIM ; ils sont repris ici, la donnée étant la même.
 */
export const FOUNDRY_KEYWORDS: Readonly<Record<string, string>> = {
  daito: "foundry.daito",
  fieldforged: "foundry.field_forged",
  fotc: "foundry.fotc",
  hakke: "foundry.hakke",
  omolon: "foundry.omolon",
  suros: "foundry.suros",
  texmechanica: "foundry.tex_mechanica",
  veist: "foundry.veist",
};

/** Préfixe des `traitIds` de fonderie — sert à `foundry:any`. */
export const FOUNDRY_PREFIX = "foundry.";

// —— Types anti-champion (DestinyBreakerType) ————————————————————
//
// Les mots-clés doublent chaque effet : DIM accepte aussi bien le nom de
// l'effet (« antibarrier ») que celui du Champion visé (« barrier »).

export const BREAKER_KEYWORDS: Readonly<Record<string, number>> = {
  antibarrier: 1,
  shieldpiercing: 1,
  barrier: 1,
  disruption: 2,
  overload: 2,
  stagger: 3,
  unstoppable: 3,
};

// —— Rangs de statistique ————————————————————————————————————————

/**
 * `stat:highest:>=30` — la statistique la mieux notée de l'objet, quelle
 * qu'elle soit. Les six rangs couvrent les six statistiques d'armure.
 */
export const STAT_RANK_KEYWORDS: Readonly<Record<string, number>> = {
  highest: 1,
  secondhighest: 2,
  thirdhighest: 3,
  fourthhighest: 4,
  fifthhighest: 5,
  sixthhighest: 6,
};

/** `stat:any:>=30` — au moins une statistique satisfait la comparaison. */
export const STAT_ANY = "any";
