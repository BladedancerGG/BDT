#!/usr/bin/env python3
"""Repère les règles CSS qui se recouvrent, sur la feuille compilée.

La feuille **compilée** et non les sources : le SCSS est imbriqué, ses mixins
recopient des déclarations, et c'est le résultat qui compte. Elle est demandée
non minifiée — la minification de Next fusionne déjà une partie de ce qu'on
cherche justement à voir.

Trois relevés, du plus grave au plus indicatif :

 1. une propriété déclarée **deux fois dans le même bloc** ;
 2. un même sélecteur déclaré **plusieurs fois** avec des propriétés qui se
    recouvrent — le cas d'un bloc oublié après une réécriture ;
 3. des blocs **strictement identiques** entre sélecteurs différents. Souvent
    légitime, parfois une factorisation qui se demande : simplement listé.

Seuls les deux premiers font échouer le script.
"""

import collections
import re
import sys

# Recouvrements connus et voulus : une valeur de mixin surchargée localement.
# `section-title` pose `font-size: 0.625rem`, que ces blocs remplacent — c'est
# de la surcharge SCSS ordinaire, pas un oubli.
ALLOWED = {
    (".equipment-mode__title", "font-size"),
}


def parse(css: str):
    """Rend (contexte @, sélecteur, [déclarations]) pour chaque bloc."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    rules, stack, i = [], [], 0
    while i < len(css):
        brace = css.find("{", i)
        if brace == -1:
            break
        close = css.find("}", i)
        if close != -1 and close < brace:
            if stack:
                stack.pop()
            i = close + 1
            continue
        head = css[i:brace].strip()
        if head.startswith("@"):
            stack.append(head)
            i = brace + 1
            continue
        end = css.find("}", brace)
        rules.append((
            " | ".join(stack),
            head,
            [d.strip() for d in css[brace + 1:end].split(";") if d.strip()],
        ))
        i = end + 1
        while i < len(css) and css[i:].lstrip().startswith("}") and stack:
            i = css.index("}", i) + 1
            stack.pop()
    return rules


def prop(decl: str) -> str:
    return decl.split(":")[0].strip()


def main(path: str) -> int:
    rules = parse(open(path).read())
    problems = 0

    print("— propriétés répétées dans un même bloc")
    hits = 0
    for ctx, sel, decls in rules:
        # Les variables CSS se redéclarent légitimement (repli puis valeur).
        counts = collections.Counter(
            prop(d) for d in decls if not prop(d).startswith("--")
        )
        dup = sorted(p for p, n in counts.items() if n > 1
                     and (sel, p) not in ALLOWED)
        if dup:
            hits += 1
            problems += 1
            print(f"  KO {sel}{f'   [{ctx}]' if ctx else ''} → {dup}")
    if not hits:
        print("  ok  aucune")

    print("\n— sélecteurs qui se recouvrent (même contexte)")
    blocks = collections.defaultdict(list)
    for ctx, sel, decls in rules:
        blocks[(ctx, sel)].append(decls)
    hits = 0
    for (ctx, sel), found in blocks.items():
        if len(found) < 2:
            continue
        counts = collections.Counter()
        for decls in found:
            for p in {prop(d) for d in decls}:
                counts[p] += 1
        clash = sorted(p for p, n in counts.items() if n > 1
                       and (sel, p) not in ALLOWED)
        if clash:
            hits += 1
            problems += 1
            print(f"  KO {sel}{f'   [{ctx}]' if ctx else ''}"
                  f"  ×{len(found)} → {clash}")
    if not hits:
        print("  ok  aucun")

    print("\n— blocs strictement identiques (indicatif, souvent légitime)")
    same = collections.defaultdict(set)
    for ctx, sel, decls in rules:
        if len(decls) >= 3:
            same[(ctx, tuple(sorted(decls)))].add(sel)
    listed = 0
    for (ctx, _), sels in sorted(same.items(), key=lambda kv: sorted(kv[1])):
        if len(sels) > 1:
            listed += 1
            print(f"     {' / '.join(sorted(sels))}{f'   [{ctx}]' if ctx else ''}")
    if not listed:
        print("     aucun")

    print(f"\n{len(rules)} règles analysées, {problems} recouvrement(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
