"use client";

import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {PauseIcon, PlayIcon} from "@heroicons/react/24/solid";
import {
    LOG_LEVELS,
    isLogLevel,
    matchesLogFilter,
    parseLogLine,
    type LogEntry,
    type LogFilter,
    type LogLevel,
} from "@/lib/admin/log-types";

/**
 * Lignes gardées à l'écran. Au-delà, les plus anciennes tombent : la page
 * peut rester ouverte des heures, et la liste n'est pas virtualisée.
 */
const MAX_ENTRIES = 2000;

/** Attente après la dernière frappe avant de relancer la recherche */
const SEARCH_DEBOUNCE_MS = 300;

/** Écart toléré, en pixels, pour considérer la liste « tout en bas » */
const BOTTOM_SLACK = 24;

type Connection = "connecting" | "live" | "paused" | "error";

/**
 * Une ligne à l'écran, avec un identifiant propre : deux lignes peuvent
 * partager date et texte, et la position ne convient pas comme clé — la liste
 * se rogne par le haut, ce qui décalerait toutes les clés à chaque ligne reçue.
 */
type Row = LogEntry & { id: number };

let nextRowId = 0;
const toRow = (entry: LogEntry): Row => ({...entry, id: nextRowId++});

interface SearchResponse {
    entries: LogEntry[];
    truncated: boolean;
}

/**
 * Logs serveur : l'historique (recherche dans tous les fichiers gardés), puis
 * les nouvelles lignes en direct.
 *
 * Le flux n'est pas filtré côté serveur : le filtre courant s'applique ici
 * aux lignes qui arrivent, si bien que changer de recherche ne coupe pas la
 * connexion. Mettre en pause la ferme ; la reprise relance la recherche pour
 * combler le trou.
 */
export function LogViewer() {
    const t = useTranslations("admin.logs");
    const locale = useLocale();

    const [query, setQuery] = useState("");
    const [level, setLevel] = useState<LogLevel | "">("");
    const [filter, setFilter] = useState<LogFilter>({query: ""});
    const [entries, setEntries] = useState<Row[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [paused, setPaused] = useState(false);
    const [connection, setConnection] = useState<Connection>("connecting");

    // Lu par le flux, qui ne doit pas se reconnecter à chaque frappe.
    const filterRef = useRef(filter);
    useEffect(() => {
        filterRef.current = filter;
    }, [filter]);

    // —— Recherche (anti-rebond sur la saisie, immédiate sur le niveau) ——
    useEffect(() => {
        const timer = setTimeout(
            () => setFilter({query: query.trim(), level: level || undefined}),
            SEARCH_DEBOUNCE_MS,
        );
        return () => clearTimeout(timer);
    }, [query, level]);

    const search = useCallback(async (current: LogFilter, signal: AbortSignal) => {
        setLoading(true);
        setFailed(false);
        try {
            const params = new URLSearchParams({q: current.query});
            if (current.level) params.set("level", current.level);
            const res = await fetch(`/api/admin/logs?${params}`, {signal, cache: "no-store"});
            if (!res.ok) throw new Error(String(res.status));
            const data = (await res.json()) as SearchResponse;
            setEntries(data.entries.slice(-MAX_ENTRIES).map(toRow));
            setTruncated(data.truncated);
        } catch (err) {
            if (signal.aborted) return;
            console.error("[logs] recherche :", err);
            setFailed(true);
        } finally {
            if (!signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (paused) return;
        const controller = new AbortController();
        // eslint-disable-next-line react-hooks/set-state-in-effect -- requête réseau, l'état suit sa réponse
        void search(filter, controller.signal);
        return () => controller.abort();
    }, [filter, paused, search]);

    // —— Flux en direct ——
    useEffect(() => {
        if (paused) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- reflète la connexion fermée
            setConnection("paused");
            return;
        }
        setConnection("connecting");
        const source = new EventSource("/api/admin/logs/stream");
        source.onopen = () => setConnection("live");
        // EventSource se reconnecte seul ; l'état revient à « live » au prochain onopen.
        source.onerror = () => setConnection("error");
        source.onmessage = (event: MessageEvent<string>) => {
            const entry = parseLogLine(event.data);
            if (!entry || !matchesLogFilter(entry, filterRef.current)) return;
            setEntries((prev) => {
                const next = prev.length >= MAX_ENTRIES ? prev.slice(prev.length - MAX_ENTRIES + 1) : prev.slice();
                next.push(toRow(entry));
                return next;
            });
        };
        return () => source.close();
    }, [paused]);

    // —— Défilement : on suit le bas tant que l'utilisateur y est ——
    const listRef = useRef<HTMLOListElement>(null);
    const atBottomRef = useRef(true);
    const onScroll = () => {
        const el = listRef.current;
        if (!el) return;
        atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
    };
    useLayoutEffect(() => {
        const el = listRef.current;
        if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
    }, [entries]);

    const timeFormat = useMemo(
        () => new Intl.DateTimeFormat(locale, {dateStyle: "short", timeStyle: "medium"}),
        [locale],
    );

    return (
        <section className="log-viewer" aria-label={t("title")}>
            <form className="log-viewer__toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
                <input
                    type="search"
                    className="log-viewer__search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    aria-label={t("search")}
                    maxLength={200}
                />
                <select
                    className="log-viewer__level"
                    value={level}
                    onChange={(e) => setLevel(isLogLevel(e.target.value) ? e.target.value : "")}
                    aria-label={t("level")}
                >
                    <option value="">{t("allLevels")}</option>
                    {LOG_LEVELS.map((l) => (
                        <option key={l} value={l}>{t(`levels.${l}`)}</option>
                    ))}
                </select>
                <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => setPaused((p) => !p)}
                    aria-pressed={paused}
                >
                    {paused ? <PlayIcon className="log-viewer__icon"/> : <PauseIcon className="log-viewer__icon"/>}
                    {paused ? t("resume") : t("pause")}
                </button>
                <span className="log-viewer__connection" data-state={connection}>
                    {t(`connection.${connection}`)}
                </span>
            </form>

            <p className="log-viewer__status" aria-live="polite">
                {loading
                    ? t("loading")
                    : failed
                        ? t("failed")
                        : truncated
                            ? t("truncated", {count: entries.length})
                            : t("count", {count: entries.length})}
            </p>

            <ol ref={listRef} className="log-viewer__list" onScroll={onScroll}>
                {!loading && entries.length === 0 && (
                    <li className="log-viewer__empty">{t("empty")}</li>
                )}
                {entries.map((entry) => (
                    <li
                        key={entry.id}
                        className={`log-viewer__entry log-viewer__entry--${entry.l}`}
                    >
                        <time className="log-viewer__time" dateTime={entry.t}>
                            {timeFormat.format(new Date(entry.t))}
                        </time>
                        <span className="log-viewer__badge">{t(`levels.${entry.l}`)}</span>
                        <pre className="log-viewer__message">{entry.m}</pre>
                    </li>
                ))}
            </ol>
        </section>
    );
}
