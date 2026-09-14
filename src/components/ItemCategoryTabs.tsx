"use client";

import {useTranslations} from "next-intl";
import {ITEM_CATEGORIES} from "@/lib/settings/constants";
import {useSettings} from "@/lib/settings/store";
import {
    ArchiveBoxIcon,
    SparklesIcon,
    Squares2X2Icon,
} from "@heroicons/react/24/solid";

/**
 * Onglets de famille d'objets : équipement, personnalisation, rangement
 * partagé.
 *
 * Ils ne changent pas de mode d'affichage — c'est le rôle de `ViewModeTabs` —
 * mais **ce qui est montré** des deux côtés de la vue à la fois : les
 * emplacements du personnage à gauche et le contenu du coffre à droite. Les
 * deux ne se dissocient jamais : chercher un vaisseau au coffre pour le poser
 * sur son emplacement demande de voir les deux en même temps.
 *
 * La famille vit dans les préférences, donc dans le cookie : on retrouve
 * l'onglet quitté au rechargement, comme pour le mode d'affichage.
 */
export function ItemCategoryTabs() {
    const t = useTranslations();
    const category = useSettings((s) => s.itemCategory);
    const setCategory = useSettings((s) => s.setItemCategory);

    return (
        <div
            className="item-category-tabs"
            role="tablist"
            aria-label={t("inventory.itemCategory")}
        >
            {ITEM_CATEGORIES.map((value) => (
                <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={value === category}
                    className={`btn btn--small item-category-tabs__tab${
                        value === category ? " item-category-tabs__tab--active" : ""
                    }`}
                    onClick={() => setCategory(value)}
                >
                    {value === "equipment" && <Squares2X2Icon/>}
                    {value === "customization" && <SparklesIcon/>}
                    {value === "inventory" && <ArchiveBoxIcon/>}
                    {/* Les libellés vivent dans `common` : « Inventaire » y est
                        déjà, et le groupe doit couvrir toutes les valeurs. */}
                    <span>{t(`common.${value}`)}</span>
                </button>
            ))}
        </div>
    );
}
