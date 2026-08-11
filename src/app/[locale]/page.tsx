import {getTranslations} from "next-intl/server";
import {getCurrentUser} from "@/lib/auth/current-user";
import {Dashboard} from "@/components/Dashboard";
import {HeaderActions} from "@/components/HeaderActions";
import {SearchBar} from "@/components/search/SearchBar";

export default async function Home() {
    const user = await getCurrentUser();
    const t = await getTranslations("auth");

    return (
        <main className="app-main">
            <header className="app-header">
                <h1 className="app-header__title">BDT</h1>

                {/* La barre s'étire entre le titre et la barre de compte */}
                {user && <SearchBar/>}

                {user && (
                    <div className="auth-bar">
                        <p>
                            <span className="auth-bar__name">
                                {user.displayName}
                            </span>

                            {/* Custom messages :) */}
                            {user.displayName === "Bladedancer#9791" && " (C'est moi !!!)"}
                            {user.displayName === "Penguin#3117" && " (antartica man)"}
                            {user.displayName === "Fay#8377" && " (:3)"}
                            {user.displayName === "Synnefo#1676" && " (nephew)"}
                            {user.displayName === "Grayellow#4829" && " (certified unc status)"}
                            {(user.displayName === "Lexa#6685" || user.displayName === "Phrolova#4092") && " (empl*yed)"}  {/* Sorrow */}
                            {user.displayName === "Justabee0#6559" && " (omg is that noice???!!!)"}
                            {user.displayName === "Alyx#4951" && " (final god of Last Wish farms)"}
                            {user.displayName === "Eclipse#4170" && " (sedge farmer 👩‍🌾)"}
                            {user.displayName === "Boog Sloogus#6012" && " (goog...)"}
                            {user.displayName === "Imbaer#4829" && " (haha, feet)"}
                            {user.displayName === "☞〠♡FLANNEL♡〠☜#1570" && " (bane of homeowners)"}

                            {user.displayName === "Bog on my dog#7426" && " (Welcome, final god of sleep schedule)"}

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
