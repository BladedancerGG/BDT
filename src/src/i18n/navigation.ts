import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Équivalents de Link / useRouter conscients de la langue courante :
// indispensables pour changer de langue en conservant le chemin.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
