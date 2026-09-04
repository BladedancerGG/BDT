import type { DisplayProperties } from "@/lib/manifest/use-definition";

/** Un socket tel que décrit par la définition de l'objet. */
export interface SocketEntryDefinition {
  singleInitialItemHash: number;
  /** Pool de plugs fixe (perks curatés) */
  reusablePlugSetHash?: number;
  /** Pool de plugs tiré aléatoirement (rolls aléatoires) */
  randomizedPlugSetHash?: number;
  reusablePlugItems?: { plugItemHash: number }[];
  /**
   * Masque SocketPlugSources : d'où viennent les plugs équipables sur ce
   * socket. Voir PLUG_SOURCE dans sockets.ts — sans lui, impossible de savoir
   * s'il faut lire l'instance ou les plugs débloqués du compte.
   */
  plugSources?: number;
}

// Champs de DestinyInventoryItemDefinition réellement utilisés par l'UI.
export interface InventoryItemDefinition {
  displayProperties: DisplayProperties;
  itemType: number;
  /** DestinyItemSubType — distingue notamment les épées (18) */
  itemSubType?: number;
  itemTypeDisplayName?: string;
  /** Présent sur les plugs (perks, mods, ornements, shaders…) */
  plug?: {
    plugCategoryIdentifier?: string;
    /**
     * Coût en énergie d'armure. **Souvent absent**, et c'est significatif :
     * seuls les mods d'armure en portent un, de 0 à 4 (relevé sur le manifeste).
     * Pièces maîtresses et mods d'artifice n'en ont aucun, bien qu'ils logent
     * dans la même catégorie de sockets — voir `plug-energy.ts`.
     */
    energyCost?: { energyCost: number };
  };
  /** Écarts de statistiques conférés — voir plug-stats.ts */
  investmentStats?: {
    statTypeHash: number;
    value: number;
    isConditionallyActive?: boolean;
  }[];
  /**
   * Perks associés. Aspects, fragments et attributs d'artéfact ont un
   * `displayProperties.description` vide : leur texte est ici.
   * `perkVisibility` : 0 = visible, 1 = désactivé, 2 = masqué.
   */
  perks?: { perkHash: number; perkVisibility?: number }[];
  /**
   * Étiquettes sémantiques de l'objet (« weapon.hand_cannon », « foundry.hakke »).
   *
   * C'est la seule source de la fonderie d'une arme — voir FOUNDRY_KEYWORDS —
   * et elle est indépendante de la langue, contrairement à sa description.
   */
  traitIds?: string[];
  /** Filigrane de saison par défaut */
  iconWatermark?: string;
  /** Filigrane des objets « mis en avant » */
  iconWatermarkFeatured?: string;
  isFeaturedItem?: boolean;
  /** Objet « holofoil » : fond animé au lieu de la couleur de rareté */
  isHolofoil?: boolean;
  /**
   * Objet lié au personnage : doctrines, artéfacts. L'API refuse tout
   * `TransferItem` dessus — il ne peut ni rejoindre le coffre ni changer de
   * personnage.
   */
  nonTransferrable?: boolean;
  /** false pour ce qui ne s'équipe pas (matériaux, quêtes…) */
  equippable?: boolean;
  /**
   * Sortir cet objet des Objets perdus peut détruire quelque chose (Bungie ne
   * sait pas dire quoi) : l'API refuse le `PullFromPostMaster` par défaut.
   */
  doesPostmasterPullHaveSideEffects?: boolean;
  /**
   * Classe requise (DestinyClass) : 0 Titan, 1 Chasseur, 2 Arcaniste,
   * 3 = aucune restriction. Les armures et doctrines la portent.
   */
  classType?: number;
  quality?: {
    /** Filigranes par version : indexés par le versionNumber de l'instance */
    displayVersionWatermarkIcons?: string[];
  };
  inventory?: {
    tierType: number;
    tierTypeName?: string;
    /** Emplacement d'origine de l'objet */
    bucketTypeHash?: number;
  };
  defaultDamageType?: number;
  /**
   * Type anti-champion de l'arme, en énumération DestinyBreakerType (1 bloqueur,
   * 2 surchargé, 3 implacable). Vaut 0 hors de 17 exotiques : pour toutes les
   * autres, l'effet vit dans les perks de leur armature — voir breaker.ts.
   */
  breakerType?: number;
  /**
   * Présent sur les doctrines : `hudDamageType` porte leur élément
   * (`defaultDamageType` vaut toujours 0), `buildName` le couple élément/classe.
   */
  talentGrid?: { hudDamageType?: number; buildName?: string };
  equippingBlock?: {
    /** Ensemble d'armures conférant des bonus, s'il y en a un */
    equipableItemSetHash?: number;
    /**
     * Type de munitions (DestinyAmmunitionType) : 1 primaires, 2 spéciales,
     * 3 lourdes. Vaut 0 (None) hors des armes — il ne dépend plus de
     * l'emplacement de l'objet depuis longtemps.
     */
    ammoType?: number;
  };
  sockets?: {
    socketEntries: SocketEntryDefinition[];
    socketCategories: {
      socketCategoryHash: number;
      socketIndexes: number[];
    }[];
  };
}

/** Bonus d'ensemble : perks actifs à partir de N pièces équipées. */
export interface EquipableItemSetDefinition {
  displayProperties: DisplayProperties;
  /** Tous les objets de l'ensemble (5 emplacements × 3 classes) */
  setItems: number[];
  setPerks: { requiredSetCount: number; sandboxPerkHash: number }[];
}

export interface SandboxPerkDefinition {
  displayProperties: DisplayProperties;
  /** false quand le perk ne porte pas d'information destinée au joueur */
  isDisplayable?: boolean;
}

export interface StatDefinition {
  displayProperties: DisplayProperties;
  statCategory?: number;
}

/** Type de dégâts : c'est lui qui porte l'icône d'élément d'une arme. */
export interface DamageTypeDefinition {
  displayProperties: DisplayProperties;
  /** Variante détourée, celle que le jeu affiche sur fond sombre */
  transparentIconPath?: string;
}

/** Type anti-champion d'une arme (bloqueur, surchargé, implacable). */
export interface BreakerTypeDefinition {
  displayProperties: DisplayProperties;
  enumValue: number;
}

/**
 * Objectif d'un plug : compte-frags d'arme, niveau d'arme façonnée…
 *
 * `progressDescription` porte le libellé affiché (« Ennemis vaincus ») —
 * `displayProperties.name` est vide sur ces objectifs. `uiLabel` est la seule
 * clé stable et indépendante de la langue pour les reconnaître : trois hashes
 * différents partagent `crafting_weapon_level_progress`.
 */
export interface ObjectiveDefinition {
  displayProperties: DisplayProperties;
  progressDescription?: string;
  completionValue: number;
  uiLabel?: string;
}

export interface SocketCategoryDefinition {
  displayProperties: DisplayProperties;
}

/** Pool de plugs possibles pour un socket. */
export interface PlugSetDefinition {
  reusablePlugItems: {
    plugItemHash: number;
    currentlyCanRoll?: boolean;
  }[];
}
// —— Identifiants des équipements sauvegardés ————————————————————
//
// Ces trois tables sont les seules du manifeste utilisées ici à ne PAS avoir de
// `displayProperties` : leur contenu tient dans un unique champ, et un accès
// via `displayProperties.icon` y renverrait toujours undefined.

/** Fond coloré d'une vignette d'équipement. */
export interface LoadoutColorDefinition {
  colorImagePath: string;
}

/** Glyphe d'une vignette d'équipement. */
export interface LoadoutIconDefinition {
  iconImagePath: string;
}

/** Nom d'un équipement, choisi dans une liste fermée (« Alpha », « Bêta »…). */
export interface LoadoutNameDefinition {
  name: string;
}

/**
 * Listes **ordonnées** des identifiants proposés par le jeu.
 *
 * Une seule entrée dans la table (hash 1). Les trois tables d'identifiants sont
 * indexées par hash : sans ces listes, rien ne dit dans quel ordre le jeu les
 * présente.
 */
export interface LoadoutConstantsDefinition {
  loadoutColorHashes: number[];
  loadoutIconHashes: number[];
  loadoutNameHashes: number[];
}

/** Hash de l'unique DestinyLoadoutConstantsDefinition. */
export const LOADOUT_CONSTANTS_HASH = 1;
