// Vocabulaire de la recherche : les mots-clés que l'utilisateur tape, et ce
// qu'ils désignent dans les données du jeu.
//
// Tout est en anglais, comme la syntaxe de Destiny Item Manager, avec quelques
// alias français pour les termes que l'interface affiche traduits (« filobscur »
// pour strand, « portée » pour range…). La normalisation retire accents,
// espaces et ponctuation : `stat:reload speed`, `stat:reload-speed` et
// `stat:reloadspeed` désignent la même statistique.
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
  sante: 392767087,
  melee: 4244567218,
  grenade: 1735777505,
  super: 144602215,
  class: 1943323491,
  classe: 1943323491,
  weapons: 2996146975,
  armes: 2996146975,

  // —— Armes ——
  impact: 4043523819,
  range: 1240592695,
  portee: 1240592695,
  accuracy: 1591432999,
  precision: 1591432999,
  blastradius: 3614673599,
  rayondusouffle: 3614673599,
  velocity: 2523465841,
  velocite: 2523465841,
  persistence: 3085395333,
  shieldduration: 1842278586,
  dureebouclier: 1842278586,
  stability: 155624089,
  stabilite: 155624089,
  handling: 943549884,
  maniement: 943549884,
  reload: 4188031367,
  reloadspeed: 4188031367,
  rechargement: 4188031367,
  aimassist: 1345609583,
  aimassistance: 1345609583,
  aidealavisee: 1345609583,
  airborne: 2714457168,
  airborneeffectiveness: 2714457168,
  efficaciteaerienne: 2714457168,
  zoom: 3555269338,
  ammogeneration: 1931675084,
  generationdemunitions: 1931675084,
  rpm: 4284893193,
  roundsperminute: 4284893193,
  cadence: 4284893193,
  drawtime: 447667954,
  vitessedetir: 447667954,
  chargetime: 2961396640,
  vitessedecharge: 2961396640,
  heat: 3481294762,
  heatgenerated: 3481294762,
  chaleurgeneree: 3481294762,
  cooling: 4006394725,
  coolingefficiency: 4006394725,
  refroidissement: 4006394725,
  recoil: 2715839340,
  recoildirection: 2715839340,
  directiondurecul: 2715839340,
  magazine: 3871231066,
  mag: 3871231066,
  chargeur: 3871231066,

  // —— Épées et glaives ——
  swingspeed: 2837207746,
  vitessedecoup: 2837207746,
  chargerate: 3022301683,
  tauxdechargement: 3022301683,
  guardresistance: 209426660,
  resistancedelagarde: 209426660,
  guardendurance: 3736848092,
  endurancedelagarde: 3736848092,
  guardefficiency: 2762071195,
  ammocapacity: 925767036,
  munitions: 925767036,
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
  cinetique: 1,
  arc: 2,
  solar: 3,
  solaire: 3,
  void: 4,
  abyssal: 4,
  stasis: 6,
  stase: 6,
  strand: 7,
  filobscur: 7,
};

// —— Raretés (tierType) ————————————————————————————————————————

export const TIER_KEYWORDS: Readonly<Record<string, number>> = {
  basic: 2,
  basique: 2,
  common: 3,
  uncommon: 3,
  commun: 3,
  rare: 4,
  legendary: 5,
  legendaire: 5,
  exotic: 6,
  exotique: 6,
};

// —— Classes (DestinyClass) ————————————————————————————————————

export const CLASS_KEYWORDS: Readonly<Record<string, number>> = {
  titan: 0,
  hunter: 1,
  chasseur: 1,
  warlock: 2,
  arcaniste: 2,
};

// —— Types de munitions (DestinyAmmunitionType) ————————————————

export const AMMO_KEYWORDS: Readonly<Record<string, number>> = {
  primary: 1,
  primaire: 1,
  primaires: 1,
  special: 2,
  speciale: 2,
  speciales: 2,
  heavy: 3,
  lourde: 3,
  lourdes: 3,
};

// —— Types d'objets (DestinyItemSubType) ————————————————————————
//
// Le sous-type est déjà porté par la définition, contrairement aux catégories
// d'objets qui demanderaient une table de plus : il couvre à lui seul les types
// d'armes et les pièces d'armure.

export const SUBTYPE_KEYWORDS: Readonly<Record<string, number>> = {
  autorifle: 6,
  fusilautomatique: 6,
  shotgun: 7,
  fusilapompe: 7,
  machinegun: 8,
  mitrailleuse: 8,
  handcannon: 9,
  revolver: 9,
  rocketlauncher: 10,
  lanceroquettes: 10,
  fusionrifle: 11,
  fusilafusion: 11,
  sniperrifle: 12,
  fusildeprecision: 12,
  pulserifle: 13,
  fusilaimpulsion: 13,
  scoutrifle: 14,
  fusilexplorateur: 14,
  sidearm: 17,
  armedepoing: 17,
  sword: 18,
  epee: 18,
  linearfusionrifle: 22,
  fusilafusionlineaire: 22,
  grenadelauncher: 23,
  lancegrenades: 23,
  submachinegun: 24,
  pistoletmitrailleur: 24,
  tracerifle: 25,
  fusiltraceur: 25,
  bow: 31,
  glaive: 33,
  helmet: 26,
  casque: 26,
  gauntlets: 27,
  gantelets: 27,
  chest: 28,
  chestarmor: 28,
  plastron: 28,
  leg: 29,
  legarmor: 29,
  jambieres: 29,
  classitem: 30,
  objetdeclasse: 30,
};
