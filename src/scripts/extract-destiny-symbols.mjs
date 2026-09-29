// Génère src/lib/destiny/symbols.generated.ts à partir des polices de symboles
// du jeu (public/fonts/*.otf).
//
//   node scripts/extract-destiny-symbols.mjs
//
// Pourquoi extraire plutôt que recopier une table à la main : Bungie n'a jamais
// publié la correspondance nom ↔ point de code de ces polices. Elle est en
// revanche inscrite dans la police elle-même (charset CFF), et c'est la seule
// source qui ne se périmera pas au prochain remplacement du fichier.
//
// Deux informations en sortent :
//  - le point de code de chaque glyphe, indexé par son nom ;
//  - sa chasse. Les glyphes de **chasse nulle** sont des calques : le jeu les
//    superpose au glyphe voisin (le « clic gauche » est le corps de souris
//    `mouse1` plus le bouton `mouse1_button`). Sans cette marque, rien ne les
//    distinguerait d'un symbole ordinaire.
//
// Le script n'a aucune dépendance : fontTools n'est pas installable dans le
// conteneur, et ajouter un paquet npm pour une exécution ponctuelle serait
// disproportionné. Il ne lit donc que les trois tables nécessaires.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FONTS = [
  { file: "public/fonts/destiny_symbols_common.otf", source: "common" },
  { file: "public/fonts/destiny_symbols_pc.otf", source: "pc" },
];

const OUT = "src/lib/destiny/symbols.generated.ts";

// —— Lecture des tables OpenType ————————————————————————————

function readTables(buf) {
  const count = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 16;
    tables[buf.toString("latin1", o, o + 4)] = {
      off: buf.readUInt32BE(o + 8),
      len: buf.readUInt32BE(o + 12),
    };
  }
  return tables;
}

/** cmap → point de code par identifiant de glyphe. Formats 4 et 12 seulement. */
function readCmap(buf, off) {
  const subtables = buf.readUInt16BE(off + 2);
  let best = null;
  for (let i = 0; i < subtables; i++) {
    const o = off + 4 + i * 8;
    const sub = off + buf.readUInt32BE(o + 4);
    const format = buf.readUInt16BE(sub);
    // Le format 12 couvre les plans supplémentaires : préféré s'il existe
    if (format === 12) best = { sub, format };
    else if (format === 4 && !best) best = { sub, format };
  }
  if (!best) throw new Error("aucune sous-table cmap exploitable");

  const byGlyph = new Map();
  const add = (cp, gid) => {
    if (gid && !byGlyph.has(gid)) byGlyph.set(gid, cp);
  };

  if (best.format === 4) {
    const o = best.sub;
    const segX2 = buf.readUInt16BE(o + 6);
    const endO = o + 14;
    const startO = endO + segX2 + 2;
    const deltaO = startO + segX2;
    const rangeO = deltaO + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = buf.readUInt16BE(endO + s * 2);
      const start = buf.readUInt16BE(startO + s * 2);
      const delta = buf.readInt16BE(deltaO + s * 2);
      const range = buf.readUInt16BE(rangeO + s * 2);
      if (start === 0xffff) continue;
      for (let cp = start; cp <= end; cp++) {
        let gid;
        if (range === 0) gid = (cp + delta) & 0xffff;
        else {
          gid = buf.readUInt16BE(rangeO + s * 2 + range + (cp - start) * 2);
          if (gid) gid = (gid + delta) & 0xffff;
        }
        add(cp, gid);
      }
    }
  } else {
    const o = best.sub;
    const groups = buf.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const go = o + 16 + g * 12;
      const start = buf.readUInt32BE(go);
      const end = buf.readUInt32BE(go + 4);
      const gid = buf.readUInt32BE(go + 8);
      for (let cp = start; cp <= end; cp++) add(cp, gid + (cp - start));
    }
  }
  return byGlyph;
}

/** INDEX du format CFF : liste d'intervalles [début, fin) dans le tampon. */
function readIndex(buf, p) {
  const count = buf.readUInt16BE(p);
  if (count === 0) return { items: [], end: p + 2 };
  const offSize = buf[p + 2];
  const offsetAt = (i) => {
    let v = 0;
    const o = p + 3 + i * offSize;
    for (let k = 0; k < offSize; k++) v = v * 256 + buf[o + k];
    return v;
  };
  const data = p + 3 + (count + 1) * offSize - 1;
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push([data + offsetAt(i), data + offsetAt(i + 1)]);
  }
  return { items, end: data + offsetAt(count) };
}

/** Opérandes du dictionnaire CFF, réduites à ce dont on a besoin. */
function topDictOffsets(buf, start, end) {
  let operands = [];
  const found = {};
  for (let i = start; i < end; ) {
    const b0 = buf[i];
    if (b0 <= 21) {
      let op = b0;
      i += 1;
      if (b0 === 12) {
        op = 1200 + buf[i];
        i += 1;
      }
      if (op === 15) found.charset = operands.at(-1);
      if (op === 17) found.charStrings = operands.at(-1);
      operands = [];
    } else if (b0 === 28) {
      operands.push(buf.readInt16BE(i + 1));
      i += 3;
    } else if (b0 === 29) {
      operands.push(buf.readInt32BE(i + 1));
      i += 5;
    } else if (b0 === 30) {
      // Réel : on saute jusqu'au demi-octet terminateur (jamais un offset)
      i += 1;
      while (i < end) {
        const b = buf[i++];
        if ((b & 0x0f) === 0x0f || b >> 4 === 0x0f) break;
      }
      operands.push(0);
    } else if (b0 >= 32 && b0 <= 246) {
      operands.push(b0 - 139);
      i += 1;
    } else if (b0 >= 247 && b0 <= 250) {
      operands.push((b0 - 247) * 256 + buf[i + 1] + 108);
      i += 2;
    } else if (b0 >= 251 && b0 <= 254) {
      operands.push(-(b0 - 251) * 256 - buf[i + 1] - 108);
      i += 2;
    } else i += 1;
  }
  return found;
}

/** Nombre de chaînes standard du format CFF — les SID au-delà sont propres à la police. */
const CFF_STANDARD_STRINGS = 391;

/** charset CFF → nom de chaque glyphe. */
function readGlyphNames(buf, cffOff) {
  const headerSize = buf[cffOff + 2];
  const nameIndex = readIndex(buf, cffOff + headerSize);
  const topIndex = readIndex(buf, nameIndex.end);
  const stringIndex = readIndex(buf, topIndex.end);

  const [ds, de] = topIndex.items[0];
  const { charset, charStrings } = topDictOffsets(buf, ds, de);
  if (!charset || charset <= 2) return new Map(); // charset prédéfini : pas de noms utiles

  const glyphCount = readIndex(buf, cffOff + charStrings).items.length;
  const sidName = (sid) => {
    if (sid < CFF_STANDARD_STRINGS) return null; // chaîne standard : pas un symbole
    const item = stringIndex.items[sid - CFF_STANDARD_STRINGS];
    return item ? buf.toString("latin1", item[0], item[1]) : null;
  };

  const names = new Map();
  let o = cffOff + charset;
  const format = buf[o++];
  let gid = 1; // le glyphe 0 est toujours .notdef
  if (format === 0) {
    while (gid < glyphCount) {
      names.set(gid++, sidName(buf.readUInt16BE(o)));
      o += 2;
    }
  } else if (format === 1 || format === 2) {
    while (gid < glyphCount) {
      const first = buf.readUInt16BE(o);
      o += 2;
      const left = format === 1 ? buf[o++] : (buf.readUInt16BE(o), (o += 2), buf.readUInt16BE(o - 2));
      for (let i = 0; i <= left && gid < glyphCount; i++) {
        names.set(gid++, sidName(first + i));
      }
    }
  }
  return names;
}

function parseFont(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  const tables = readTables(buf);
  const codepoints = readCmap(buf, tables.cmap.off);
  const names = readGlyphNames(buf, tables["CFF "].off);
  const longHorMetrics = buf.readUInt16BE(tables.hhea.off + 34);
  const advance = (gid) =>
    buf.readUInt16BE(tables.hmtx.off + Math.min(gid, longHorMetrics - 1) * 4);

  const glyphs = [];
  for (const [gid, name] of names) {
    const cp = codepoints.get(gid);
    // Les glyphes sans point de code sont inatteignables depuis du texte ;
    // les caractères de contrôle et l'espace ne sont pas des symboles.
    if (!name || cp === undefined || cp <= 0x20) continue;
    glyphs.push({ name, cp, overlay: advance(gid) === 0 });
  }
  glyphs.sort((a, b) => a.cp - b.cp);
  return glyphs;
}

// —— Écriture du module ————————————————————————————————————

const all = [];
const seen = new Map();
for (const { file, source } of FONTS) {
  for (const glyph of parseFont(file)) {
    const previous = seen.get(glyph.name);
    if (previous) {
      console.warn(`nom en double : ${glyph.name} (${previous} / ${source})`);
      continue;
    }
    seen.set(glyph.name, source);
    all.push({ ...glyph, source });
  }
}

const esc = (cp) => `\\u${cp.toString(16).toUpperCase().padStart(4, "0")}`;
const key = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

const lines = all.map(
  (g) => `  ${key(g.name)}: "${esc(g.cp)}",${g.overlay ? " // calque" : ""}`,
);
const overlays = all.filter((g) => g.overlay).map((g) => `  ${JSON.stringify(g.name)},`);

const out = `// Généré par scripts/extract-destiny-symbols.mjs — ne pas modifier à la main.
//
// Points de code des symboles du jeu, tels qu'ils sont nommés dans
// public/fonts/destiny_symbols_common.otf et destiny_symbols_pc.otf.
// ${all.length} glyphes, dont ${all.filter((g) => g.overlay).length} calques.

/** Caractère de chaque symbole, indexé par le nom que lui donne la police. */
export const DESTINY_GLYPHS = {
${lines.join("\n")}
} as const;

export type DestinyGlyphName = keyof typeof DESTINY_GLYPHS;

/**
 * Glyphes de chasse nulle : ils ne valent rien seuls et se superposent à un
 * autre glyphe (fond de touche, bouton de souris éclairé…).
 */
export const DESTINY_OVERLAY_GLYPHS: ReadonlySet<string> = new Set([
${overlays.join("\n")}
]);
`;

fs.writeFileSync(path.join(ROOT, OUT), out);
console.log(`${OUT} : ${all.length} glyphes`);
