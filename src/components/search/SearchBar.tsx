"use client";

import {
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
import {DestinySymbol} from "@/components/DestinySymbol";

/** Contexte neutre : la validité d'une requête ne dépend d'aucune donnée. */
const NO_CONTEXT = {
  currentCharacterId: null,
  dupeHashes: new Set<number>(),
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

  // Fermeture au clic extérieur : les deux menus recouvrent le contenu.
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

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

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      remember(query);
      setMenu(null);
    } else if (event.key === "Escape") {
      // Première pression : referme le menu ; sinon, vide la recherche
      if (menu) setMenu(null);
      else setQuery("");
    }
  };

  const pick = (entry: string) => {
    setQuery(entry);
    remember(entry);
    setMenu(null);
    inputRef.current?.focus();
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
          onChange={(event) => setQuery(event.target.value)}
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
          onClick={() => setMenu(menu === "actions" ? null : "actions")}
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
          onClick={() => setMenu(menu === "history" ? null : "history")}
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
