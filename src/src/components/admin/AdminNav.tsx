"use client";

import {useTranslations} from "next-intl";
import {ChartBarIcon, CommandLineIcon} from "@heroicons/react/24/solid";
import {Link, usePathname} from "@/i18n/navigation";

/** Les pages d'administration, dans l'ordre du menu. Partagé avec le menu principal. */
export const ADMIN_PAGES = [
    {href: "/admin/stats", key: "stats", Icon: ChartBarIcon},
    {href: "/admin/logs", key: "logs", Icon: CommandLineIcon},
] as const;

/** Onglets entre les pages d'administration. */
export function AdminNav() {
    const t = useTranslations("admin.nav");
    const pathname = usePathname();
    return (
        <nav className="admin-nav" aria-label={t("label")}>
            {ADMIN_PAGES.map(({href, key, Icon}) => (
                <Link
                    key={href}
                    href={href}
                    className="admin-nav__link"
                    aria-current={pathname === href ? "page" : undefined}
                >
                    <Icon className="admin-nav__icon"/>
                    {t(key)}
                </Link>
            ))}
        </nav>
    );
}
