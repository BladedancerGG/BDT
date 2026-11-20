import {redirect} from "@/i18n/navigation";
import {requireAdmin} from "@/lib/auth/admin";

/** `/admin` n'a pas de contenu propre : il mène à la première page. */
export default async function AdminIndexPage({params}: { params: Promise<{ locale: string }> }) {
    await requireAdmin();
    const {locale} = await params;
    redirect({href: "/admin/stats", locale});
}
