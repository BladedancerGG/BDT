# Vérification des moteurs purs

Le dépôt n'a **pas** de framework de test, et ce n'est pas un oubli : la
validation y est manuelle, comme le rappelle `CLAUDE.md`. Ces fichiers ne
changent rien à cela — ce sont les scripts de la recette qu'il décrit
(« compiler le module ciblé puis l'exécuter dans le conteneur »), rangés là
plutôt que réécrits à chaque fois.

Ils ne couvrent que les modules **purs** : ceux qui ne connaissent ni React, ni
le store, ni le réseau, et dont la logique Destiny est justement celle qui se
casse en silence.

| Fichier            | Module vérifié                        |
| ------------------ | ------------------------------------- |
| `edit.check.ts`    | `lib/loadouts/groups/edit.ts`         |
| `equip.check.ts`   | `lib/loadouts/groups/equip.ts`        |
| `insert.check.ts`  | `lib/destiny/insert-plan.ts`          |

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
