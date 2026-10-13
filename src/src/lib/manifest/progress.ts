// Progression du téléchargement du manifeste, pondérée par le travail réel.
//
// Compter les tables faisait rester la barre à 0 % pendant presque tout le
// chargement : la table des objets passe la première et pèse la moitié du
// travail. Chaque table pèse ici une **estimation de sa durée**, et avance
// pendant sa réception, puis pendant son écriture, par lots.
//
// Module pur : ni réseau, ni IndexedDB.

/** Ce que le relais annonce d'une table (en-têtes X-Manifest-Size / -Rows). */
export interface TableSize {
    /** Taille du JSON décompressé */
    bytes: number;
    rows: number;
}

// Coût estimé, en millisecondes, mesuré dans Chromium (20 Mbit/s, 40 ms de
// latence) table par table. L'écriture coûte surtout **par ligne** : la table
// des icônes, 7 Mo pour 26 645 lignes, prend 930 ms à écrire ; celle des objets,
// 85 Mo pour 38 894 lignes, 1 720 ms. Ce modèle retrouve chaque table mesurée
// à ±10 %. Pondérer par les seuls octets laissait les dernières tables — petites
// mais nombreuses en lignes — traîner sur le dernier quart du temps.
//
// Seules les proportions comptent : un réseau ou un poste plus lent étire tout,
// la réception un peu plus que l'écriture, sans casser la progression.
const READ_MS_PER_BYTE = 1.6e-5;
const WRITE_MS_PER_ROW = 0.034;
const WRITE_MS_PER_BYTE = 4.8e-6;

export class WeightedProgress {
    private readonly sizes: TableSize[];
    private readonly read: number[];
    private readonly write: number[];
    private readonly credit: number[];
    private readonly total: number;
    private lastPercent = -1;

    /**
     * @param sizes taille de chaque table — une valeur absente ou invalide
     *        compte pour 0, et une table sans aucune taille pèse 1 : elle
     *        progresse quand même
     * @param emit appelé à chaque point de pourcentage franchi, et pas plus :
     *        la progression part du worker vers React, un message par
     *        morceau de flux ferait des milliers de rendus
     */
    constructor(
        sizes: readonly TableSize[],
        private readonly emit: (done: number, total: number, index: number) => void,
    ) {
        const valid = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
        this.sizes = sizes.map(({bytes, rows}) => ({bytes: valid(bytes), rows: valid(rows)}));
        this.read = this.sizes.map(({bytes}) => READ_MS_PER_BYTE * bytes);
        this.write = this.sizes.map(({bytes, rows}, i) => {
            const estimate = WRITE_MS_PER_ROW * rows + WRITE_MS_PER_BYTE * bytes;
            return estimate > 0 || this.read[i] > 0 ? estimate : 1;
        });
        this.credit = this.sizes.map(() => 0);
        this.total = this.read.reduce((sum, r, i) => sum + r + this.write[i], 0);
    }

    /** `bytes` octets (décompressés) de la table `index` sont arrivés. */
    received(index: number, bytes: number): void {
        const expected = this.sizes[index].bytes;
        if (expected > 0) this.advance(index, this.read[index] * Math.min(1, bytes / expected));
    }

    /** La table `index` est reçue et analysée. */
    parsed(index: number): void {
        this.advance(index, this.read[index]);
    }

    /** `rows` lignes sur `of` de la table `index` sont écrites. */
    written(index: number, rows: number, of: number): void {
        this.advance(index, this.read[index] + this.write[index] * Math.min(1, rows / of));
    }

    private advance(index: number, credit: number): void {
        // Jamais de recul : des octets comptés en retard, ou une taille
        // annoncée fausse, ne doivent pas faire revenir la barre en arrière.
        this.credit[index] = Math.max(this.credit[index], credit);
        const done = this.credit.reduce((sum, c) => sum + c, 0);
        const percent = Math.floor((done / this.total) * 100);
        if (percent !== this.lastPercent) {
            this.lastPercent = percent;
            this.emit(done, this.total, index);
        }
    }
}
