"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import { useSettings } from "@/lib/settings/store";
import { parseQuery } from "@/lib/search/query";
import { compileQuery } from "@/lib/search/filters";
import { useSearchStore } from "@/lib/search/store";
import { useHydrated } from "@/lib/search/use-hydrated";
import {
  applySuggestion,
  suggestionsFor,
  type Suggestion,
} from "@/lib/search/suggestions";
import {DestinySymbol} from "@/components/DestinySymbol";

/** Contexte neutre : la validité d'une requête ne dépend d'aucune donnée. */
const NO_CONTEXT = {
  currentCharacterId: null,
  currentCharacterClass: null,
  copies: new Map<number, number>(),
  loadouts: new Map(),
};

type Menu = "history" | "actions" | null;

/**
 * Barre de recherche d'objets, dans l'en-tête de l'application.
 *
 * Elle ne connaît ni le manifeste ni le profil : elle n'écrit que la requête
 * dans le store partagé, que la vue d'inventaire lit de son côté (voir
 * `lib/search/provider.tsx`). C'est ce qui lui permet de vivre dans l'en-tête,
 * hors de l'arbre où les définitions sont chargées.
 *
 * Deux menus, tous deux ancrés sous la barre : l'historique (chevron) et les
 * actions à effectuer sur les objets trouvés (trois points). Ces dernières sont
 * publiées par l'inventaire — le bouton reste inerte tant qu'il n'y a rien à
 * déplacer.
 *
 * Un troisième panneau s'ouvre pendant la frappe : l'autocomplétion. Elle
 * complète le terme **sous le curseur**, et non la fin de la barre — on revient
 * souvent corriger un filtre au milieu d'une requête. Les touches suivent DIM :
 * flèches pour parcourir, Tab pour insérer.
 */
export function SearchBar() {
  const t = useTranslations("search");
  const tMove = useTranslations("actions.move");
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const remember = useSearchStore((s) => s.remember);
  const history = useSearchStore((s) => s.history);
  const clearHistory = useSearchStore((s) => s.clearHistory);
  const results = useSearchStore((s) => s.results);
  const historySize = useSettings((s) => s.searchHistorySize);

  const [menu, setMenu] = useState<Menu>(null);
  // Position du curseur au moment de la dernière frappe : c'est elle qui
  // désigne le terme à compléter. Elle vit dans l'état et non dans une ref,
  // parce que la liste des propositions en dépend.
  const [caret, setCaret] = useState(0);
  const [highlighted, setHighlighted] = useState(-1);
  const [completing, setCompleting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Le store porte de l'état que le serveur ne peut pas connaître : requête en
  // cours, historique relu dans localStorage, résultats publiés par
  // l'inventaire. Le rendu du serveur ne peut donc être que celui d'une barre
  // vierge, et le premier rendu du client doit lui être identique.
  const mounted = useHydrated();

  // Requête fautive : la barre le signale, et la vue s'abstient de filtrer.
  const invalid = useMemo(() => {
    if (!query.trim()) return false;
    const parsed = parseQuery(query);
    if (parsed.errors.length > 0) return true;
    return compileQuery(parsed.node, NO_CONTEXT).errors.length > 0;
  }, [query]);

  // Fermeture au clic extérieur : les menus recouvrent le contenu.
  useEffect(() => {
    if (!menu && !completing) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setMenu(null);
      setCompleting(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu, completing]);

  // Frappe au clavier n'importe où dans la page : la recherche prend le focus.
  // Le `keydown` n'est pas absorbé pour une lettre — le caractère atterrit donc
  // dans le champ nouvellement focalisé, sans qu'on ait à l'y insérer nous-même.
  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      const input = inputRef.current;
      if (!target || !input || target === input) return;
      // Une autre saisie a la priorité, et une modale piège le focus : dans les
      // deux cas la frappe ne nous appartient pas.
      if (target.isContentEditable) return;
      if (target.closest("input, textarea, select, [role='dialog']")) return;

      input.focus();
      // Sinon la touche déclencherait aussi la validation de la requête vide
      if (event.key === "Enter") event.preventDefault();
    };

    document.addEventListener("keydown", onGlobalKeyDown);
    return () => document.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  const suggestions = useMemo(
    () => (mounted && completing ? suggestionsFor(query, caret, history) : []),
    [mounted, completing, query, caret, history],
  );
  const listOpen = completing && suggestions.length > 0;

  const insert = useCallback(
    (suggestion: Suggestion) => {
      const next = applySuggestion(query, caret, suggestion);
      setQuery(next.query);
      setCaret(next.caret);
      setHighlighted(-1);
      // Choisir dans l'historique, c'est valider une requête entière : elle
      // remonte en tête, et il n'y a plus rien à compléter.
      if (suggestion.kind === "history") {
        remember(suggestion.value);
        setCompleting(false);
      }

      // Le champ est contrôlé : sa position de curseur est reposée par React à
      // la fin de la valeur au prochain rendu. On la rétablit après celui-ci,
      // sans quoi compléter un filtre au milieu d'une requête renverrait la
      // frappe suivante à la fin.
      const input = inputRef.current;
      if (input) {
        requestAnimationFrame(() => {
          input.focus();
          input.setSelectionRange(next.caret, next.caret);
        });
      }
    },
    [query, caret, setQuery, remember],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (listOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      // Le champ est un `search` : sans ça, les flèches déplacent le curseur.
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((current) => {
        const next = current + step;
        if (next < 0) return suggestions.length - 1;
        if (next >= suggestions.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === "Tab" && listOpen) {
      // Tab insère la proposition au lieu de quitter le champ — la convention
      // de DIM. Sans sélection explicite, c'est la première qui est prise.
      event.preventDefault();
      insert(suggestions[Math.max(highlighted, 0)]);
      return;
    }

    if (event.key === "Enter") {
      if (listOpen && highlighted >= 0) {
        event.preventDefault();
        insert(suggestions[highlighted]);
        return;
      }
      remember(query);
      setMenu(null);
      setCompleting(false);
    } else if (event.key === "Escape") {
      // Une pression par panneau ouvert, la barre n'est vidée qu'en dernier
      if (listOpen) setCompleting(false);
      else if (menu) setMenu(null);
      else setQuery("");
    }
  };

  const pick = (entry: string) => {
    setQuery(entry);
    remember(entry);
    setMenu(null);
    setCompleting(false);
    inputRef.current?.focus();
  };

  /** Ouvre l'un des deux menus à bouton, et referme l'autocomplétion. */
  const toggleMenu = (wanted: Menu) => {
    setMenu(menu === wanted ? null : wanted);
    setCompleting(false);
  };

  const value = mounted ? query : "";
  const total = mounted ? (results?.total ?? null) : null;
  const canAct = mounted && (results?.movable ?? 0) > 0;
  const shownHistory = mounted ? history.slice(0, historySize) : [];

  return (
    <div
      className={`search-bar${invalid && mounted ? " search-bar--invalid" : ""}`}
      ref={rootRef}
    >
      <div className="search-bar__field">
        <svg
          className="search-bar__icon"
          viewBox="0 0 16 16"
          aria-hidden
          focusable="false"
        >
          <circle
            cx="7"
            cy="7"
            r="4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M10.5 10.5L14 14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>

        <DestinySymbol name={"num_enter"}/>

        <input
          ref={inputRef}
          type="search"
          className="search-bar__input"
          value={value}
          placeholder={t("placeholder")}
          aria-label={t("label")}
          aria-invalid={invalid && mounted}
          title={invalid && mounted ? t("invalid") : undefined}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls="search-suggestions"
          aria-activedescendant={
            highlighted >= 0 ? `search-suggestion-${highlighted}` : undefined
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
            setHighlighted(-1);
            setCompleting(true);
            setMenu(null);
          }}
          // Un clic ou une flèche déplace le curseur sans rien changer à la
          // valeur : c'est pourtant un autre terme qu'il faut compléter.
          onSelect={(event) =>
            setCaret(event.currentTarget.selectionStart ?? 0)
          }
          onKeyDown={onKeyDown}
        />

        {total !== null && (
          <span className="search-bar__count">{t("found", { count: total })}</span>
        )}

        {/* La croix n'a de sens qu'avec quelque chose à effacer */}
        {value !== "" && (
          <button
            type="button"
            className="search-bar__button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label={t("clear")}
            title={t("clear")}
          >
            <svg viewBox="0 0 16 16" aria-hidden focusable="false">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}

        <button
          type="button"
          className="search-bar__button"
          onClick={() => toggleMenu("actions")}
          disabled={!canAct}
          aria-expanded={menu === "actions"}
          aria-label={t("actionsLabel")}
          title={t("actionsLabel")}
        >
          <span aria-hidden>•••</span>
        </button>

        <button
          type="button"
          className="search-bar__button search-bar__button--chevron"
          onClick={() => toggleMenu("history")}
          aria-expanded={menu === "history"}
          aria-label={t("historyLabel")}
          title={t("historyLabel")}
        >
          <svg viewBox="0 0 16 16" aria-hidden focusable="false">
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {listOpen && (
        <div
          className="search-menu"
          id="search-suggestions"
          role="listbox"
          aria-label={t("suggestionsLabel")}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.value}
              id={`search-suggestion-${index}`}
              type="button"
              role="option"
              aria-selected={index === highlighted}
              className={`search-menu__item${
                index === highlighted ? " search-menu__item--active" : ""
              }${suggestion.kind === "history" ? " search-menu__item--muted" : ""}`}
              // Le survol déplace la sélection : sinon deux surbrillances se
              // disputeraient la liste, celle de la souris et celle du clavier.
              onMouseEnter={() => setHighlighted(index)}
              // `mousedown` plutôt que `click` : le champ perdrait le focus
              // avant que le clic n'aboutisse.
              onMouseDown={(event) => {
                event.preventDefault();
                insert(suggestion);
              }}
            >
              {suggestion.value}
            </button>
          ))}
        </div>
      )}

      {menu === "history" && (
        <div className="search-menu" role="menu">
          {shownHistory.length === 0 ? (
            <p className="search-menu__empty">{t("historyEmpty")}</p>
          ) : (
            <>
              {shownHistory.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="menuitem"
                  className="search-menu__item"
                  onClick={() => pick(entry)}
                >
                  {entry}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className="search-menu__item search-menu__item--muted"
                onClick={() => {
                  clearHistory();
                  setMenu(null);
                }}
              >
                {t("historyClear")}
              </button>
            </>
          )}
        </div>
      )}

      {menu === "actions" && results && (
        <div className="search-menu" role="menu">
          {results.characters.map((character) => (
            <button
              key={character.characterId}
              type="button"
              role="menuitem"
              className="search-menu__item"
              onClick={() => {
                results.move({
                  kind: "inventory",
                  characterId: character.characterId,
                });
                setMenu(null);
              }}
            >
              {tMove("toCharacter", { character: character.label })}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="search-menu__item"
            onClick={() => {
              results.move({ kind: "vault" });
              setMenu(null);
            }}
          >
            {tMove("vault")}
          </button>
        </div>
      )}
    </div>
  );
}
