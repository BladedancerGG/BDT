import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Dashboard } from "@/components/Dashboard";

export default async function Home() {
  const user = await getCurrentUser();
  const t = await getTranslations("auth");

  return (
    <main className="app-main">
      <header className="app-header">
        <h1 className="app-header__title">Destiny Loadouts Manager</h1>

        {user && (
          <div className="auth-bar">
            <p>
              {t("signedInAs")}{" "}
              <span className="auth-bar__name">{user.displayName}</span>
            </p>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn btn--small">
                {t("logout")}
              </button>
            </form>
          </div>
        )}
      </header>

      {user ? (
        <Dashboard />
      ) : (
        <div className="login-screen">
          {/* Navigation complète volontaire : la route OAuth répond par une
              redirection vers bungie.net, qu'un <Link> client ne suivrait pas. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/login" className="btn btn--primary">
            {t("login")}
          </a>
        </div>
      )}
    </main>
  );
}
