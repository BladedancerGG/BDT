// Vérification de `WeightedProgress` dans `lib/manifest/progress.ts` — la
// barre de progression du téléchargement du manifeste.
//
// Ce que ces cas protègent : une barre qui recule, qui s'arrête avant 100 %,
// qui inonde React de messages (un par morceau de flux, soit des milliers pour
// la table des objets, relayés du worker vers la page) — ou qui ignore le coût
// des lignes, et laisse les dernières tables traîner sur le dernier quart.

import { WeightedProgress, type TableSize } from "../../src/lib/manifest/progress";
import { check, report, section } from "./assert";

// Tailles réelles (manifeste français allégé)
const ITEMS: TableSize = { bytes: 85_214_913, rows: 38_894 };
const ICONS: TableSize = { bytes: 7_005_380, rows: 26_645 };
const STATS: TableSize = { bytes: 16_810, rows: 79 };

function recorder(sizes: TableSize[]) {
    const percents: number[] = [];
    const tables: number[] = [];
    const progress = new WeightedProgress(sizes, (done, total, index) => {
        percents.push(Math.floor((done / total) * 100));
        tables.push(index);
    });
    return { progress, percents, tables };
}

/** Déroule une table : réception par morceaux, analyse, écriture par lots. */
function playTable(progress: WeightedProgress, index: number, size: TableSize) {
    for (let b = 0; b <= size.bytes; b += Math.max(1, Math.floor(size.bytes / 50))) {
        progress.received(index, b);
    }
    progress.parsed(index);
    for (let r = 0; r <= size.rows; r += 5000) progress.written(index, r, size.rows);
    progress.written(index, size.rows, size.rows);
}

// —— Pondération ————————————————————————————————————————————————————
section("les lignes pèsent, pas seulement les octets");
{
    const { progress, percents } = recorder([ITEMS, ICONS]);
    playTable(progress, 0, ITEMS);
    const itemsShare = percents.at(-1)!;
    const bytesShare = Math.floor((ITEMS.bytes / (ITEMS.bytes + ICONS.bytes)) * 100);
    // Pondérée par les octets, la table des objets ferait 92 % ; les 26 645
    // lignes des icônes coûtent pourtant 930 ms à écrire, contre 1 720 ms.
    check(`table des objets : moins que sa part d'octets (${bytesShare} %)`, itemsShare < bytesShare - 10, true);
    check("et plus de la moitié", itemsShare > 50, true);
    playTable(progress, 1, ICONS);
    check("toutes les tables : 100 %", percents.at(-1), 100);
}

section("la réception fait avancer la barre");
{
    const { progress, percents } = recorder([ITEMS]);
    progress.received(0, ITEMS.bytes / 2);
    const half = percents.at(-1)!;
    progress.parsed(0);
    const read = percents.at(-1)!;
    check("moitié des octets : moitié de la part de réception", Math.abs(half - read / 2) <= 1, true);
    check("la réception ne vaut pas tout", read > 10 && read < 90, true);
}

// —— Monotonie et fréquence ————————————————————————————————————————
section("jamais de recul, un message par point de pourcentage au plus");
{
    const { progress, percents } = recorder([ITEMS, STATS, ICONS]);
    playTable(progress, 0, ITEMS);
    playTable(progress, 1, STATS);
    playTable(progress, 2, ICONS);
    check("strictement croissante", percents.every((p, i) => i === 0 || p > percents[i - 1]), true);
    check("au plus 101 messages", percents.length <= 101, true);
    check("finit à 100 %", percents.at(-1), 100);
}
{
    const { progress, percents } = recorder([{ bytes: 10, rows: 1 }]);
    progress.received(0, 40);
    const capped = percents.at(-1);
    progress.parsed(0);
    check("taille sous-estimée : plafonnée à la part de réception", percents.at(-1), capped);
    progress.received(0, 5);
    check("des octets « en retard » ne font pas reculer", percents.at(-1), capped);
}

section("tailles absentes ou invalides");
{
    // En-tête absent : Number(null) vaut 0 ; en-tête illisible : NaN
    const { progress, percents } = recorder([
        { bytes: 0, rows: 0 },
        { bytes: Number.NaN, rows: Number.NaN },
    ]);
    progress.received(0, 1000);
    check("sans taille, la réception n'avance pas la barre", percents, []);
    progress.written(0, 1, 1);
    check("une table sans taille compte quand même", percents.at(-1), 50);
    progress.written(1, 1, 1);
    check("et la barre finit à 100 %", percents.at(-1), 100);
}

section("la table en cours accompagne chaque message");
{
    const { progress, tables } = recorder([STATS, STATS]);
    progress.written(0, 1, 1);
    progress.written(1, 1, 1);
    check("indices des tables", tables, [0, 1]);
}

process.exit(report());
