import type {Metadata} from "next";
import {getTranslations} from "next-intl/server";
import {requireAdmin} from "@/lib/auth/admin";
import {APP_TITLE} from "@/lib/app-info";
import {LogViewer} from "@/components/admin/LogViewer";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("admin.nav");
    return {title: `${t("logs")} — ${APP_TITLE}`};
}

export default async function AdminLogsPage() {
    await requireAdmin();
    return <LogViewer/>;
}
