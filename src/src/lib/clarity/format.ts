// Descriptions communautaires de Clarity (https://www.d2clarity.com) : format
// relayé au client, et allègement du fichier publié par Clarity.
//
// Module pur — ni React, ni réseau : le serveur l'utilise pour alléger le
// fichier, le client pour en lire le type, et `scripts/checks/clarity.check.ts`
// le vérifie.
//
// Source : `descriptions/clarity.json` du dépôt Database-Clarity/
// Live-Clarity-Database, branche `live`. C'est la seule des sept variantes du
// dossier qui garde les valeurs PvE / PvP **balisées** (`classNames: ["pve"]`) :
// celle destinée à DIM les aplatit en texte (« [PVP: 4000%] »), et il n'y aurait
// plus rien à colorer.
//
// Le contenu n'est pas retouché — les conditions de Clarity l'interdisent sans
// le signaler clairement. On ne fait que retirer ce que l'app ne lit pas : les
// métadonnées d'édition (auteur, date, type, nom), les statistiques chiffrées
// et les langues autres que l'anglais (il n'en existe aucune aujourd'hui).

/** Un morceau de ligne : du texte, ou une icône quand `text` manque. */
export interface ClaritySegment {
    text?: string;
    /** Mise en forme : `pve`, `pvp`, un élément (`solar`…), `bold`, `link`… */
    classNames?: string[];
    /** Adresse d'un lien (classe `link`) — toujours en https */
    link?: string;
    /** Explication d'un terme (classe `title`), affichée en note */
    title?: ClarityBlock[];
}

/**
 * Un bloc : une ligne de segments, ou un séparateur (`spacer`) quand il n'a
 * pas de `linesContent`. Ses classes valent pour toute la ligne — certaines
 * lignes entières sont marquées PvE, PvP ou en gras.
 */
export interface ClarityBlock {
    classNames?: string[];
    linesContent?: ClaritySegment[];
}

/** Descriptions par hash de plug (DestinyInventoryItemDefinition). */
export type ClarityDescriptions = Record<string, ClarityBlock[]>;

/** Langue retenue : Clarity n'en publie pas d'autre. */
const LANGUAGE = "en";

/**
 * Version du format **produit** par `slimClarity`. Elle entre dans l'URL du
 * fichier, servi `immutable` : changer ce que produit l'allègement sans
 * l'incrémenter laisserait les navigateurs sur l'ancien fichier pendant un an.
 */
export const CLARITY_FORMAT = 1;

/**
 * Profondeur des explications : celles des segments d'une description, pas
 * celles qu'une explication contiendrait — il n'y en a aucune aujourd'hui, et
 * une note ne saurait renvoyer à une autre note.
 */
const MAX_DEPTH = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Classes dédoublonnées : Clarity écrit parfois `["bold", "bold"]`. */
function classNames(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const out = [...new Set(value.filter((c): c is string => typeof c === "string" && c !== ""))];
    return out.length > 0 ? out : undefined;
}

/**
 * Seul le https est accepté : l'adresse vient d'un fichier tiers et finit dans
 * un `href` — un `javascript:` y serait exécuté au clic.
 */
function safeLink(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    try {
        return new URL(value).protocol === "https:" ? value : undefined;
    } catch {
        return undefined;
    }
}

function slimSegment(raw: unknown, depth: number): ClaritySegment | null {
    if (!isRecord(raw)) return null;
    const out: ClaritySegment = {};
    if (typeof raw.text === "string" && raw.text !== "") out.text = raw.text;
    const classes = classNames(raw.classNames);
    if (classes) out.classNames = classes;
    const link = safeLink(raw.link);
    if (link) out.link = link;
    if (depth < MAX_DEPTH) {
        const title = slimBlocks(raw.title, depth + 1);
        if (title.length > 0) out.title = title;
    }
    // Ni texte ni classe : rien à afficher, pas même une icône.
    return out.text || out.classNames ? out : null;
}

function slimBlocks(raw: unknown, depth: number): ClarityBlock[] {
    if (!Array.isArray(raw)) return [];
    const out: ClarityBlock[] = [];
    for (const item of raw) {
        if (!isRecord(item)) continue;
        const block: ClarityBlock = {};
        const classes = classNames(item.classNames);
        if (classes) block.classNames = classes;
        if (Array.isArray(item.linesContent)) {
            const segments = item.linesContent
                .map((segment) => slimSegment(segment, depth))
                .filter((segment): segment is ClaritySegment => segment !== null);
            if (segments.length === 0) continue;
            block.linesContent = segments;
        } else if (!classes) {
            continue;
        }
        out.push(block);
    }
    return trimSpacers(out);
}

/** Un séparateur n'a de sens qu'entre deux lignes. */
function trimSpacers(blocks: ClarityBlock[]): ClarityBlock[] {
    let start = 0;
    let end = blocks.length;
    while (start < end && !blocks[start].linesContent) start += 1;
    while (end > start && !blocks[end - 1].linesContent) end -= 1;
    return blocks.slice(start, end);
}

/**
 * Allège `clarity.json` : `{ <hash>: [blocs] }`, en anglais, sans métadonnées.
 * Une entrée sans description anglaise — il y en a — est omise.
 */
export function slimClarity(raw: unknown): ClarityDescriptions {
    const out: ClarityDescriptions = {};
    if (!isRecord(raw)) return out;
    for (const [key, entry] of Object.entries(raw)) {
        if (!isRecord(entry) || !isRecord(entry.descriptions)) continue;
        // La clé de l'objet et son champ `hash` coïncident ; la clé est
        // retenue, c'est elle que l'app interroge.
        if (!/^\d+$/.test(key)) continue;
        const blocks = slimBlocks(entry.descriptions[LANGUAGE], 0);
        if (blocks.length > 0) out[key] = blocks;
    }
    return out;
}

/** Version publiée par Clarity (`versions.json`, champ `descriptions`). */
export function clarityVersion(raw: unknown): string | null {
    if (!isRecord(raw)) return null;
    const value = raw.descriptions;
    const text = typeof value === "number" ? String(value) : value;
    // Elle entre dans un chemin de fichier : chiffres et points seulement, un
    // chiffre en tête pour écarter « . » et « .. ».
    return typeof text === "string" && /^\d[\d.]*$/.test(text) ? text : null;
}

/**
 * Numérote les explications de termes d'une description, dans l'ordre de
 * lecture, pour les afficher en notes sous le texte.
 *
 * Des notes et non une infobulle au survol du terme : l'infobulle d'un plug se
 * ferme dès que le curseur quitte son icône, aucun terme qu'elle contient ne
 * peut donc être survolé.
 */
export function clarityNotes(blocks: readonly ClarityBlock[]): Map<ClaritySegment, number> {
    const notes = new Map<ClaritySegment, number>();
    for (const block of blocks) {
        for (const segment of block.linesContent ?? []) {
            if (segment.title) notes.set(segment, notes.size + 1);
        }
    }
    return notes;
}

/** Ce qu'il faut d'un plug pour lui trouver un équivalent chez Clarity. */
export interface ClarityPlugKey {
    hash: number;
    name?: string;
    category?: string;
    tier?: number;
}

/** Équivalents possibles, par nom et famille de plug. */
export type ClarityIndex = Map<string, ClarityPlugKey[]>;

function indexKey(plug: ClarityPlugKey): string | null {
    return plug.name && plug.category ? `${plug.category}|${plug.name}` : null;
}

/**
 * Index des plugs que Clarity décrit, par nom et famille de plug — de quoi
 * retrouver la description d'une **variante** qu'il ne liste pas.
 *
 * Clarity ne décrit qu'un plug par perk, alors que le jeu en duplique beaucoup
 * sous d'autres hashes : relevé sur le manifeste, ~335 plugs n'avaient rien
 * pour cette seule raison — 118 armatures améliorées, 85 attributs d'origine
 * améliorés, 20 mods d'arme améliorés, chargeurs et canons améliorés (« Balles
 * de gros calibre » n'est décrit que sous sa forme ordinaire).
 *
 * Nom **et** famille (`plugCategoryIdentifier`) : le nom seul confondrait un
 * attribut et un mod homonymes. Les noms sont ceux du manifeste dans la langue
 * de l'app, jamais ceux, anglais, de Clarity — la clé se compare donc à
 * elle-même.
 */
export function clarityIndex(plugs: readonly ClarityPlugKey[]): ClarityIndex {
    const index: ClarityIndex = new Map();
    for (const plug of plugs) {
        const key = indexKey(plug);
        if (!key) continue;
        const list = index.get(key);
        if (list) list.push(plug);
        else index.set(key, [plug]);
    }
    return index;
}

/**
 * Hash sous lequel Clarity décrit un plug : le sien, ou celui d'une variante
 * homonyme de la même famille.
 *
 * Entre plusieurs variantes, celle de même rareté l'emporte : sept perks ont
 * chez Clarity une version ordinaire et une version améliorée aux textes
 * différents, et la variante améliorée d'un plug doit lire la seconde.
 */
export function resolveClarityHash(
    plug: ClarityPlugKey,
    descriptions: ClarityDescriptions,
    index: ClarityIndex | undefined,
): number | undefined {
    if (descriptions[plug.hash]) return plug.hash;
    const key = indexKey(plug);
    const candidates = key ? index?.get(key) : undefined;
    if (!candidates?.length) return undefined;
    return (candidates.find((c) => c.tier === plug.tier) ?? candidates[0]).hash;
}
