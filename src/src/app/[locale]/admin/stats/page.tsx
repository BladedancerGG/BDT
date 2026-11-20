import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import {requireAdmin} from "@/lib/auth/admin";
import {APP_TITLE} from "@/lib/app-info";
import {
    filterGroups,
    filterShares,
    filterUsers,
    sortGroups,
    sortShares,
    sortUsers,
    listCalls,
    listEndpoints,
    listHttpStatuses,
    listGroups,
    listShares,
    listUsers,
} from "@/lib/admin/stats";
import {parseTableFilters, type AdminTable} from "@/lib/admin/filters";
import {nextSort, parseSort, sortDirectionOf, writeSort} from "@/lib/admin/sort";
import {TableFilters} from "@/components/admin/TableFilters";
import {SortHeader} from "@/components/admin/SortHeader";
import {BUNGIE_CALL_STATUSES} from "@/lib/bungie/call-log";
import {AdminSection} from "@/components/admin/AdminSection";
import {AdminDate} from "@/components/admin/AdminDate";
import {Link} from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("admin.nav");
    return {title: `${t("stats")} — ${APP_TITLE}`};
}

/** Paramètres de la page tels que Next les livre, en URLSearchParams. */
function toParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
        for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
            params.append(key, v);
        }
    }
    return params;
}

/** Lien vers une autre page d'appels, filtres conservés, ramené sur leur section. */
function callsPageHref(params: URLSearchParams, page: number): string {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    return `/admin/stats?${next}#calls`;
}

export default async function AdminStatsPage({
                                                 searchParams,
                                             }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireAdmin();
    const params = toParams(await searchParams);
    const requested = Number.parseInt(params.get("page") ?? "1", 10);

    const filters = {
        users: parseTableFilters("users", params),
        groups: parseTableFilters("groups", params),
        calls: parseTableFilters("calls", params),
        shares: parseTableFilters("shares", params),
    };

    const sorts = {
        users: parseSort("users", params),
        groups: parseSort("groups", params),
        calls: parseSort("calls", params),
        shares: parseSort("shares", params),
    };

    const [t, allUsers, allGroups, allShares, calls, endpoints, httpStatuses] = await Promise.all([
        getTranslations("admin"),
        listUsers(),
        listGroups(),
        listShares(),
        listCalls(Number.isFinite(requested) ? requested : 1, filters.calls, sorts.calls),
        listEndpoints(),
        listHttpStatuses(),
    ]);
    // Utilisateurs, groupes et partages tiennent en mémoire (les groupes ne
    // sont d'ailleurs que du JSON) : filtrés et triés ici. Les appels l'ont
    // été en base.
    const users = sortUsers(filterUsers(allUsers, filters.users), sorts.users);
    const groups = sortGroups(filterGroups(allGroups, filters.groups), sorts.groups);
    const shares = sortShares(filterShares(allShares, filters.shares), sorts.shares);

    /** En-tête triable d'une colonne : le lien porte l'état du clic suivant. */
    const header = (table: AdminTable, key: string, label: string, className?: string) => {
        const next = nextSort(sorts[table], key);
        const query = writeSort(table, next, params);
        // Un autre ordre redistribue les appels entre les pages : retour à la première.
        if (table === "calls") query.delete("page");
        return (
            <SortHeader
                label={label}
                href={`/admin/stats?${query}`}
                dir={sortDirectionOf(sorts[table], key)}
                hint={t(next ? `sort.${next.dir}` : "sort.none")}
                className={className}
            />
        );
    };

    const emptyText = (table: keyof typeof filters) =>
        Object.keys(filters[table]).length ? t("noMatch") : t("empty");

    const sections = [
        {id: "users", title: t("users.title"), count: users.length},
        {id: "groups", title: t("groups.title"), count: groups.length},
        {id: "calls", title: t("calls.title"), count: calls.total},
        {id: "shares", title: t("shares.title"), count: shares.length},
    ];

    return (
        <div className="admin-stats">
            {/* Sommaire : quatre sections de longueur très inégale */}
            <nav className="admin-stats__summary" aria-label={t("summary")}>
                {sections.map((s) => (
                    <a key={s.id} href={`#${s.id}`} className="admin-stats__summary-item">
                        <span className="admin-stats__summary-count">{s.count}</span>
                        {s.title}
                    </a>
                ))}
            </nav>

            <AdminSection
                id="users"
                title={t("users.title")}
                count={users.length}
                overall={allUsers.length}
                empty={emptyText("users")}
                filters={
                    <TableFilters
                        table="users"
                        choices={{admin: [{value: "yes", label: t("yes")}, {value: "no", label: t("no")}]}}
                    />
                }
            >
                <thead>
                <tr>
                    {header("users", "displayName", t("users.displayName"))}
                    {header("users", "createdAt", t("users.createdAt"))}
                    {header("users", "lastSeenAt", t("users.lastSeenAt"))}
                    {header("users", "admin", t("users.admin"))}
                </tr>
                </thead>
                <tbody>
                {users.map((u) => (
                    <tr key={u.id}>
                        <td>{u.displayName}</td>
                        <td><AdminDate value={u.createdAt.toISOString()}/></td>
                        <td>
                            {u.lastSeenAt
                                ? <AdminDate value={u.lastSeenAt.toISOString()}/>
                                : <span className="admin-section__muted">{t("never")}</span>}
                        </td>
                        <td>{u.admin ? t("yes") : t("no")}</td>
                    </tr>
                ))}
                </tbody>
            </AdminSection>

            <AdminSection
                id="groups"
                title={t("groups.title")}
                count={groups.length}
                overall={allGroups.length}
                note={t("groups.note")}
                empty={emptyText("groups")}
                filters={<TableFilters table="groups" choices={{}}/>}
            >
                <thead>
                <tr>
                    {header("groups", "name", t("groups.name"))}
                    {header("groups", "user", t("user"))}
                    {header("groups", "loadouts", t("groups.loadouts"), "admin-section__numeric")}
                </tr>
                </thead>
                <tbody>
                {groups.map((g) => (
                    <tr key={g.key}>
                        <td>
                            <span className="admin-section__group">
                                <span
                                    className="admin-section__swatch"
                                    data-empty={g.color ? undefined : ""}
                                    style={g.color ? {"--swatch": g.color} as React.CSSProperties : undefined}
                                    title={g.color ?? t("groups.noColor")}
                                />
                                {g.name}
                            </span>
                        </td>
                        <td>{g.user}</td>
                        <td className="admin-section__numeric">{g.loadouts}</td>
                    </tr>
                ))}
                </tbody>
            </AdminSection>

            <AdminSection
                id="calls"
                title={t("calls.title")}
                count={calls.total}
                overall={calls.overall}
                note={BUNGIE_CALL_STATUSES.map(
                    (s) => `${t(`calls.statuses.${s}`)} : ${calls.byStatus[s]}`,
                ).join(" · ")}
                empty={emptyText("calls")}
                filters={
                    <TableFilters
                        table="calls"
                        choices={{
                            endpoint: endpoints.map((e) => ({value: e, label: e})),
                            httpStatus: httpStatuses.map((s) => ({value: String(s), label: String(s)})),
                            status: BUNGIE_CALL_STATUSES.map((s) => ({
                                value: s,
                                label: t(`calls.statuses.${s}`),
                            })),
                        }}
                    />
                }
                footer={calls.pages > 1 && (
                    <nav className="admin-section__pager" aria-label={t("pager.label")}>
                        {calls.page > 1 ? (
                            <Link href={callsPageHref(params, calls.page - 1)} className="btn btn--small">
                                {t("pager.previous")}
                            </Link>
                        ) : <span/>}
                        <span>{t("pager.position", {page: calls.page, pages: calls.pages})}</span>
                        {calls.page < calls.pages ? (
                            <Link href={callsPageHref(params, calls.page + 1)} className="btn btn--small">
                                {t("pager.next")}
                            </Link>
                        ) : <span/>}
                    </nav>
                )}
            >
                <thead>
                <tr>
                    {header("calls", "endpoint", t("calls.endpoint"))}
                    {header("calls", "user", t("user"))}
                    {header("calls", "date", t("date"))}
                    {header("calls", "status", t("calls.status"))}
                    {header("calls", "duration", t("calls.duration"), "admin-section__numeric")}
                </tr>
                </thead>
                <tbody>
                {calls.rows.map((c) => (
                    <tr key={c.id}>
                        <td className="admin-section__mono">
                            <span className="admin-section__method">{c.method}</span>
                            {c.endpoint}
                        </td>
                        <td>{c.user ?? <span className="admin-section__muted">{t("anonymous")}</span>}</td>
                        <td><AdminDate value={c.createdAt.toISOString()}/></td>
                        <td>
                            <span
                                className={`admin-section__status admin-section__status--${c.status}`}
                                title={c.error ?? undefined}
                            >
                                {t(`calls.statuses.${c.status}`)}
                                {c.httpStatus !== null && ` · ${c.httpStatus}`}
                                {c.attempts > 1 && ` · ${t("calls.attempts", {count: c.attempts})}`}
                            </span>
                            {c.error && <span className="admin-section__error">{c.error}</span>}
                        </td>
                        <td className="admin-section__numeric">
                            {c.durationMs !== null && t("calls.ms", {ms: c.durationMs})}
                        </td>
                    </tr>
                ))}
                </tbody>
            </AdminSection>

            <AdminSection
                id="shares"
                title={t("shares.title")}
                count={shares.length}
                overall={allShares.length}
                empty={emptyText("shares")}
                filters={
                    <TableFilters
                        table="shares"
                        choices={{
                            kind: (["group", "loadout"] as const).map((k) => ({
                                value: k,
                                label: t(`shares.kinds.${k}`),
                            })),
                        }}
                    />
                }
            >
                <thead>
                <tr>
                    {header("shares", "link", t("shares.link"))}
                    {header("shares", "kind", t("shares.kind"))}
                    {header("shares", "user", t("user"))}
                    {header("shares", "createdAt", t("shares.createdAt"))}
                </tr>
                </thead>
                <tbody>
                {shares.map((s) => (
                    <tr key={s.id}>
                        <td>
                            <a href={s.url} target="_blank" rel="noreferrer noopener">{s.name}</a>
                            <span className="admin-section__mono admin-section__muted"> {s.id}</span>
                        </td>
                        <td>{t(`shares.kinds.${s.kind}`)}</td>
                        <td>{s.user}</td>
                        <td><AdminDate value={s.createdAt.toISOString()}/></td>
                    </tr>
                ))}
                </tbody>
            </AdminSection>
        </div>
    );
}
