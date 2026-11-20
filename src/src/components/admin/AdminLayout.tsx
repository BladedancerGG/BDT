import {getTranslations} from "next-intl/server";
import {ArrowLeftIcon} from "@heroicons/react/24/solid";
import {Link} from "@/i18n/navigation";
import {APP_TITLE} from "@/lib/app-info";
import {AdminNav} from "./AdminNav";
import {ScrollTopButton} from "./ScrollTopButton";

/** Cadre des pages d'administration : en-tête, onglets, contenu. */
export async function AdminLayout({children}: { children: React.ReactNode }) {
    const t = await getTranslations("admin");
    return (
        <main className="admin-layout">
            <header className="admin-layout__header">
                <Link href="/" className="admin-layout__back">
                    <ArrowLeftIcon className="admin-layout__back-icon"/>
                    {t("nav.back")}
                </Link>
                <h1 className="admin-layout__title">
                    {t("title")}
                    <span className="admin-layout__app">{APP_TITLE}</span>
                </h1>
                <AdminNav/>
            </header>
            <div className="admin-layout__content">{children}</div>
            <ScrollTopButton/>
        </main>
    );
}
