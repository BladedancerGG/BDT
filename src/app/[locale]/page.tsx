import {getTranslations} from "next-intl/server";
import {getCurrentUser} from "@/lib/auth/current-user";
import {Dashboard} from "@/components/Dashboard";
import {HeaderActions} from "@/components/HeaderActions";

export default async function Home() {
    const user = await getCurrentUser();
    const t = await getTranslations("auth");

    return (
        <main className="app-main">
            <header className="app-header">
                <h1 className="app-header__title">Bladedancer's Destiny Tools</h1>

                {user && (
                    <div className="auth-bar">
                        <p>
                            {t("signedInAs")}{" "}
                            <span className="auth-bar__name">
                                {user.displayName}
                            </span>

                            {user.displayName === "Bladedancer#9791" ? " (Welcome back, administrator!)" : ""}

                        </p>
                        {/* Déconnexion déplacée dans les paramètres (onglet Compte) */}
                        <HeaderActions bungieMembershipId={user.bungieMembershipId}/>
                    </div>
                )}
            </header>

            {user ? (
                <Dashboard/>
            ) : (
                <div className="login-screen">
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/api/auth/login" className="btn btn--primary">
                        {t("login")}
                    </a>
                </div>
            )}
        </main>
    );
}
