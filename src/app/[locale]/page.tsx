import { useTranslations } from "next-intl";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Dashboard } from "@/components/Dashboard";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen flex flex-col items-center gap-6 p-8">
      <HomeHeader />
      {user ? (
        <>
          <div className="flex items-center gap-4">
            <p>
              Connecté en tant que <strong>{user.displayName}</strong>
            </p>
            <form action="/api/auth/logout" method="post">
              <button className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600">
                <LogoutLabel />
              </button>
            </form>
          </div>
          <Dashboard />
        </>
      ) : (
        <div className="flex flex-1 items-center">
          <a
            href="/api/auth/login"
            className="rounded bg-amber-600 px-4 py-2 font-medium hover:bg-amber-500"
          >
            <LoginLabel />
          </a>
        </div>
      )}
    </main>
  );
}

// Petits composants clients pour les traductions (useTranslations est client-safe
// mais on isole les libellés pour la lisibilité)
function HomeHeader() {
  const t = useTranslations("app");
  return (
    <div className="text-center">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="text-neutral-400">{t("subtitle")}</p>
    </div>
  );
}

function LoginLabel() {
  return useTranslations("auth")("login");
}

function LogoutLabel() {
  return useTranslations("auth")("logout");
}
