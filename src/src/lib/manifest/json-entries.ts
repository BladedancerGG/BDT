// Découpe en flux un objet JSON de premier niveau — une table du manifeste,
// `{"<hash>": {...}, ...}` — en ses entrées, sans jamais tout analyser.
//
// Pourquoi : `JSON.parse` sur DestinyInventoryItemDefinition (201 Mo) monte à
// 1,1 Go de mémoire au pic, de quoi faire tomber un petit serveur de
// production. Entrée par entrée, la mémoire reste à la taille d'une définition.
//
// Module pur : ni Node, ni réseau. Le découpage ne valide pas le JSON — chaque
// entrée passe ensuite par `JSON.parse`, qui s'en charge.

export class JsonEntrySplitter {
    private buffer = "";
    /** Position, dans `buffer`, du prochain caractère à examiner */
    private cursor = 0;
    /** Début, dans `buffer`, de l'entrée en cours */
    private entryStart = -1;
    private depth = 0;
    private inString = false;
    private escaped = false;
    private done = false;

    /**
     * Ajoute un morceau de texte, renvoie les entrées complètes qu'il termine,
     * chacune sous la forme `"clé": valeur` (le texte brut, espaces compris).
     */
    push(chunk: string): string[] {
        const entries: string[] = [];
        this.buffer += chunk;
        const text = this.buffer;

        for (let i = this.cursor; i < text.length; i++) {
            const c = text.charCodeAt(i);

            if (this.inString) {
                if (this.escaped) this.escaped = false;
                else if (c === BACKSLASH) this.escaped = true;
                else if (c === QUOTE) this.inString = false;
                continue;
            }

            if (c === QUOTE) {
                this.inString = true;
            } else if (c === OPEN_BRACE || c === OPEN_BRACKET) {
                if (this.done) throw new Error("Texte après la fin de l'objet JSON");
                this.depth++;
                if (this.depth === 1) {
                    if (c !== OPEN_BRACE) throw new Error("Objet JSON attendu");
                    this.entryStart = i + 1;
                }
            } else if (c === CLOSE_BRACE || c === CLOSE_BRACKET) {
                this.depth--;
                if (this.depth === 0) {
                    this.emit(text, i, entries);
                    this.done = true;
                }
            } else if (c === COMMA && this.depth === 1) {
                this.emit(text, i, entries);
                this.entryStart = i + 1;
            }
        }

        // On ne garde que l'entrée en cours : sans cette coupe, le tampon
        // finirait par contenir tout le fichier.
        const keepFrom = this.entryStart >= 0 ? Math.min(this.entryStart, text.length) : text.length;
        this.buffer = text.slice(keepFrom);
        this.cursor = text.length - keepFrom;
        if (this.entryStart >= 0) this.entryStart -= keepFrom;
        return entries;
    }

    /** À appeler en fin de flux : un fichier tronqué ne doit jamais passer. */
    end(): void {
        if (!this.done || this.depth !== 0 || this.inString) {
            throw new Error("Objet JSON incomplet");
        }
    }

    private emit(text: string, end: number, entries: string[]): void {
        const entry = text.slice(this.entryStart, end);
        // `{}` — ou la virgule finale d'un JSON fautif — ne donne rien à émettre
        if (entry.trim() !== "") entries.push(entry);
    }
}

const QUOTE = 0x22; // "
const BACKSLASH = 0x5c; // \
const OPEN_BRACE = 0x7b; // {
const CLOSE_BRACE = 0x7d; // }
const OPEN_BRACKET = 0x5b; // [
const CLOSE_BRACKET = 0x5d; // ]
const COMMA = 0x2c; // ,
