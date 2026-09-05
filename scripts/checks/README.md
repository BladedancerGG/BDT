# Vérification des moteurs purs

Le dépôt n'a **pas** de framework de test, et ce n'est pas un oubli : la
validation y est manuelle, comme le rappelle `CLAUDE.md`. Ces fichiers ne
changent rien à cela — ce sont les scripts de la recette qu'il décrit
(« compiler le module ciblé puis l'exécuter dans le conteneur »), rangés là
plutôt que réécrits à chaque fois.

Ils ne couvrent que les modules **purs** : ceux qui ne connaissent ni React, ni
le store, ni le réseau, et dont la logique Destiny est justement celle qui se
casse en silence.

| Fichier                | Vérifie                                        |
| ---------------------- | ---------------------------------------------- |
| `edit.check.ts`        | `lib/loadouts/groups/edit.ts`                  |
| `equip.check.ts`       | `lib/loadouts/groups/equip.ts`                 |
| `insert.check.ts`      | `lib/destiny/insert-plan.ts`                   |
| `backup.check.ts`      | `lib/settings/backup.ts`                       |
| `sync-merge.check.ts`  | `lib/loadouts/groups/sync-merge.ts`            |
| `css-duplicates.py`    | la feuille de styles compilée (voir plus bas)  |

## Lancer

```bash
scripts/checks/run.sh
```

Tout se passe dans le conteneur — `node_modules` y vit dans un volume anonyme,
`npx tsc` lancé depuis l'hôte échouerait.

## Écrire une vérification

Les alias `@/…` ne se résolvent pas hors du bundler : `tsconfig.json` les
remappe sur `/app/src`. Les imports du module vérifié sont en revanche
**relatifs** (`../../src/lib/…`), et c'est nécessaire — un chemin absolu
survivrait à la compilation et `node` irait chercher les sources TypeScript.

La même contrainte pèse sur le **module vérifié lui-même** : ses imports de
*valeur* doivent être relatifs. Un `import {x} from "@/lib/…"` compile sans
broncher — TypeScript résout l'alias — puis échoue à l'exécution en
`MODULE_NOT_FOUND`, l'alias étant recopié tel quel dans le `require`. Les
`import type` n'ont pas ce problème : la compilation les efface.

Chaque fichier est autonome : il compte ses échecs et sort en code non nul.

## Le contrôle CSS

`css-duplicates.py` travaille sur la feuille **compilée et non minifiée** : le
SCSS est imbriqué, ses mixins recopient des déclarations, et la minification de
Next fusionne déjà une partie de ce qu'on cherche à voir.

Il signale une propriété déclarée deux fois dans un même bloc, et un sélecteur
déclaré plusieurs fois avec des propriétés qui se recouvrent — le cas d'un bloc
oublié après une réécriture. Ces deux-là font échouer le script.

Il liste par ailleurs les blocs strictement identiques entre sélecteurs
différents, sans échouer : c'est souvent légitime, parfois une factorisation qui
se demande.

Une surcharge voulue d'une valeur de mixin se déclare dans `ALLOWED`, en haut du
fichier, avec la raison.
