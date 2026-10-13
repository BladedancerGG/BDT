// Web Worker du téléchargement du manifeste : voir `runDownload` (manifest.ts)
// et `downloadManifest` (load.ts).
//
// Il écrit directement en IndexedDB, qu'un worker partage avec sa page : rien
// d'autre que la progression ne transite par les messages, et surtout pas les
// définitions — les recopier vers le fil principal y ramènerait le clonage
// qu'on cherche à en sortir.

import {downloadManifest, type WorkerReply, type WorkerRequest} from "./load";

// Le projet compile avec la bibliothèque « dom », où `self.postMessage` est
// celui d'une fenêtre (avec origine cible) : on type à la main le peu qui sert.
const scope = self as unknown as {
    onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
    postMessage(reply: WorkerReply): void;
};

scope.onmessage = async ({data}) => {
    try {
        await downloadManifest(data.meta, data.language, (progress) =>
            scope.postMessage({type: "progress", progress}),
        );
        scope.postMessage({type: "done"});
    } catch (err) {
        scope.postMessage({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
        });
    }
};
