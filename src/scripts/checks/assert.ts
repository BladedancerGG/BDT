// Le strict nécessaire pour comparer et compter, partagé par les vérifications.
//
// Pas de dépendance : ces fichiers sont compilés seuls, hors du bundler.

let failures = 0;

/** Compare par sérialisation : suffit pour des tableaux et objets de données. */
export function check(label: string, got: unknown, want: unknown): void {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a === b) {
        console.log(`ok  ${label}`);
        return;
    }
    failures += 1;
    console.log(`KO  ${label}\n    obtenu  ${a}\n    attendu ${b}`);
}

/** Titre de section, pour lire la sortie. */
export function section(title: string): void {
    console.log(`\n— ${title}`);
}

/** À appeler en fin de fichier : rend le code de sortie. */
export function report(): number {
    console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ÉCHEC(S)`);
    return failures === 0 ? 0 : 1;
}
