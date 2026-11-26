import {getTranslations} from "next-intl/server";
import {getCurrentUser} from "@/lib/auth/current-user";
import {Dashboard} from "@/components/Dashboard";
import {MainMenu} from "@/components/nav/MainMenu";
import {APP_TITLE} from "@/lib/app-info";
import Image from "next/image";

export default async function Home() {
    const user = await getCurrentUser();
    const t = await getTranslations("landing");

    return (
        <main className="app-main">
            {user ? (
                <>
                    <MainMenu displayName={user.displayName} admin={user.admin}/>
                    <Dashboard
                        bungieMembershipId={user.bungieMembershipId}
                        displayName={user.displayName}
                    />
                </>
            ) : (
                <div className="login-screen">
                    <h1>{APP_TITLE}</h1>
                    <Image
                        src="/images/BDT.png"
                        width={300}
                        height={300}
                        alt={APP_TITLE}
                    />
                    <h2>{t("description")}</h2>
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/api/auth/login" className="btn btn--primary">
                        {t("login")}
                    </a>
                    <div>
                        <p>{t("p1")}</p>
                        <p>{t("p2")}</p>
                    </div>
                </div>
            )}
        </main>
    );
}
