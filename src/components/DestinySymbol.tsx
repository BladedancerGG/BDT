import {
  destinySymbol,
  glyphChar,
  DESTINY_OVERLAY_GLYPHS,
  type DestinySymbolDef,
  type DestinySymbolRef,
} from "@/lib/destiny/symbols";

/**
 * Un symbole du jeu, tiré des polices de `public/fonts`.
 *
 *   <DestinySymbol name="mouseLeft" />       symbole composé
 *   <DestinySymbol name="hand_cannon" />     glyphe brut, au nom de la police
 *   <DestinySymbol name={keySymbol("E")} />  touche du clavier
 *
 * Les couches sont empilées par superposition CSS plutôt qu'en une seule chaîne
 * de caractères. La police sait pourtant les superposer seule — ses calques ont
 * une chasse nulle — mais tout le symbole prendrait alors une couleur unique :
 * ici la couche d'accent (le bouton pressé d'une souris) peut être teintée à
 * part. Pour le texte pur, `destinySymbolText()` fait l'autre choix.
 *
 * Le symbole est purement décoratif : il est masqué aux lecteurs d'écran, et
 * c'est au libellé voisin de porter le sens. `label` le rend annonçable là où
 * il est seul.
 */
export function DestinySymbol({
  name,
  label,
  className,
}: {
  name: DestinySymbolRef | DestinySymbolDef;
  label?: string;
  className?: string;
}) {
  const def = destinySymbol(name);
  if (!def || def.layers.length === 0) return null;

  return (
    <span
      className={["destiny-symbol", className].filter(Boolean).join(" ")}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {def.layers.map((layer, index) => (
        <span
          key={`${layer}-${index}`}
          className={[
            "destiny-symbol__layer",
            // La couche de chasse nulle ne dimensionne rien : elle se superpose
            // à la couche pleine, qui donne seule sa largeur au symbole.
            DESTINY_OVERLAY_GLYPHS.has(layer)
              ? "destiny-symbol__layer--overlay"
              : null,
            index === def.accent ? "destiny-symbol__layer--accent" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {glyphChar(layer)}
        </span>
      ))}
    </span>
  );
}
