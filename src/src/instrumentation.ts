// Point d'entrée de Next au démarrage du serveur.
//
// Import dynamique, et seulement sous Node : ce fichier est aussi compilé pour
// le runtime edge (le proxy i18n), où `node:fs` n'existe pas.
export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const {installConsoleCapture} = await import("@/lib/admin/server-log");
        installConsoleCapture();
    }
}
