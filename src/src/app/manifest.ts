import {readdirSync, readFileSync} from 'node:fs'
import path from 'node:path'
import type {MetadataRoute} from 'next'

const FAVICONS_DIR = path.join(process.cwd(), 'public', 'favicons')

// Les anciennes icônes y sont gardées pour mémoire seulement.
const IGNORED_DIRS = new Set(['old'])

// Dimensions lues dans l'en-tête IHDR plutôt que déduites du nom : les
// conventions des générateurs divergent (`180.png`, `…-48x48.png`,
// `….scale-125.png`), et les tuiles Windows ne sont pas toutes carrées.
function pngSize(file: string): string {
    const header = readFileSync(file).subarray(16, 24)
    return `${header.readUInt32BE(0)}x${header.readUInt32BE(4)}`
}

function listIcons(): MetadataRoute.Manifest['icons'] {
    return readdirSync(FAVICONS_DIR, {recursive: true, encoding: 'utf8'})
        .filter((file) => file.endsWith('.png') && !IGNORED_DIRS.has(file.split(path.sep)[0]))
        .sort()
        .map((file) => ({
            src: `/favicons/${file.split(path.sep).join('/')}`,
            sizes: pngSize(path.join(FAVICONS_DIR, file)),
            type: 'image/png',
        }))
}

export default function manifest(): MetadataRoute.Manifest {
    return {
        "name": "Bladedancer's Destiny tools",
        "short_name": "BDT",
        "icons": listIcons(),
        "theme_color": "#16181d",
        "background_color": "#16181d",
        "display": "standalone"
    }
}
