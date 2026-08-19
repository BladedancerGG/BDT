import {getTranslations} from "next-intl/server";
import {getCurrentUser} from "@/lib/auth/current-user";
import {Dashboard} from "@/components/Dashboard";
import {HeaderActions} from "@/components/HeaderActions";
import {SearchBar} from "@/components/search/SearchBar";
import {MainMenuButton} from "@/components/nav/MainMenuButton";
import {MainMenu} from "@/components/nav/MainMenu";
import {APP_TITLE} from "@/lib/app-info";

export default async function Home() {
    const user = await getCurrentUser();
    const t = await getTranslations("auth");

    return (
        <main className="app-main">
            {user ? (
                <>
                    <header className="app-header">
                        <div className="app-header__brand">
                            {user && <MainMenuButton/>}
                        </div>
                        <SearchBar/>
                        <HeaderActions bungieMembershipId={user.bungieMembershipId}/>
                    </header>
                    <MainMenu displayName={user.displayName}/>
                    <Dashboard/>
                </>
            ) : (
                <div className="login-screen">
                    <h1>{APP_TITLE}</h1>
                    <h2>Personal tools used to manage stuff using the bungie.net Destiny 2 API</h2>
                    <p>I'll put more things here in the future</p>
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/api/auth/login" className="btn btn--primary">
                        {t("login")}
                    </a>
                </div>
            )}
        </main>
    );
}
