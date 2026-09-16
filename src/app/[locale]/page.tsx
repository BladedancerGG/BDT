import {getTranslations} from "next-intl/server";
import {getCurrentUser} from "@/lib/auth/current-user";
import {Dashboard} from "@/components/Dashboard";
import {MainMenu} from "@/components/nav/MainMenu";
import {APP_TITLE} from "@/lib/app-info";
import Image from "next/image";

export default async function Home() {
    const user = await getCurrentUser();
    const t = await getTranslations("auth");

    return (
        <main className="app-main">
            {user ? (
                <>
                    {/* L'en-tête vit dans le `Dashboard` : il porte les onglets
                        de personnage, et ne doit donc paraître qu'une fois le
                        manifeste et le profil chargés. Les seules données du
                        serveur dont il a besoin descendent en props. */}
                    <MainMenu displayName={user.displayName}/>
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
