"use client";

import {useMemo, useState, type ReactNode} from "react";
import {useTranslations} from "next-intl";
import {ArrowPathIcon, Cog6ToothIcon, TrashIcon} from "@heroicons/react/24/solid";
import type {CatalogProfile} from "@/lib/dev/catalog-profile";
import {CATALOG_CHARACTER, CATALOG_HASH, CATALOG_SHOWCASE} from "@/lib/dev/catalog-profile";
import type {EquippedSetCounts} from "@/lib/destiny/set-bonus";
import {useItemDefs} from "@/lib/destiny/item-defs";
import {BUCKET} from "@/lib/destiny/buckets";
import {ITEM_STATE} from "@/lib/destiny/overlays";
import {
    ARMOR_STAT_MAX,
    ARMOR_STAT_ORDER,
    CHARACTER_STAT_ENHANCED,
    CHARACTER_STAT_MAX,
} from "@/lib/destiny/stat-order";
import {DESTINY_GLYPHS, type DestinyGlyphName} from "@/lib/destiny/symbols.generated";
import {DESTINY_SYMBOLS, type DestinySymbolName} from "@/lib/destiny/symbols";
import {useLoadoutIdentifiers, type LoadoutIdentifierHashes} from "@/lib/loadouts/use-loadout-identifiers";
import {useActionQueue} from "@/lib/actions/store";
import type {ActionStatus} from "@/lib/actions/store";
import {useCharacterNames} from "@/lib/destiny/use-character-names";
import {useBucketCapacities} from "@/lib/destiny/use-bucket-capacities";
import {useSettings} from "@/lib/settings/store";
import {useUi} from "@/lib/ui/store";
import {
    AmmoIcon,
    BorderIcon,
    ClassSymbol,
    EmptySlotIcon,
    EnhancedPerkIcon,
    LoadingIcon,
    LoadoutsIcon,
    PostmasterIcon,
    SearchIcon,
    VaultIcon,
    WeaponTypeIcon,
} from "@/components/icons";
import {ClassIcon} from "@/components/ClassIcon";
import {DestinySymbol} from "@/components/DestinySymbol";
import {ItemIcon} from "@/components/ItemIcon";
import {ItemThumb} from "@/components/ItemThumb";
import {EquipmentSlot} from "@/components/EquipmentSlot";
import {GroupHeader} from "@/components/GroupHeader";
import {CharacterTab} from "@/components/CharacterTab";
import {CharacterPicker} from "@/components/CharacterPicker";
import {ViewModeTabs} from "@/components/ViewModeTabs";
import {ItemCategoryTabs} from "@/components/ItemCategoryTabs";
import {VirtualItemGrid} from "@/components/VirtualItemGrid";
import {Hint} from "@/components/ui/Hint";
import {Modal} from "@/components/ui/Modal";
import {Select, SettingRow, Toggle} from "@/components/ui/SettingRow";
import {SearchBar} from "@/components/search/SearchBar";
import {SearchToggle} from "@/components/search/SearchToggle";
import {IconSizeControl} from "@/components/settings/IconSizeControl";
import {SortRuleList} from "@/components/settings/SortRuleList";
import {SizePreview} from "@/components/settings/SizePreview";
import {SettingsModal} from "@/components/settings/SettingsModal";
import {MainMenu} from "@/components/nav/MainMenu";
import {MainMenuButton} from "@/components/nav/MainMenuButton";
import {AmountPrompt} from "@/components/dnd/AmountPrompt";
import {ItemTooltip} from "@/components/tooltip/ItemTooltip";
import {PlugTooltip} from "@/components/tooltip/PlugTooltip";
import {PlugIcon} from "@/components/tooltip/PlugIcon";
import {StatBar} from "@/components/tooltip/StatBar";
import {StatTooltip} from "@/components/tooltip/StatTooltip";
import {TooltipSkeleton} from "@/components/tooltip/TooltipSkeleton";
import {CharacterSummary} from "@/components/equipment/CharacterSummary";
import {CharacterStatsTooltip} from "@/components/equipment/CharacterStatsTooltip";
import {EquipmentModeView} from "@/components/equipment/EquipmentModeView";
import {LoadoutPanel} from "@/components/loadouts/LoadoutPanel";
import {LoadoutSlotTile} from "@/components/loadouts/LoadoutSlotTile";
import {LoadoutSlotHeading} from "@/components/loadouts/LoadoutSlotHeading";
import {LoadoutTitle} from "@/components/loadouts/LoadoutTitle";
import {GroupSlotGrid} from "@/components/groups/GroupSlotGrid";
import {StaticGroupCard} from "@/components/groups/GroupCard";
import {GroupColorPicker} from "@/components/groups/GroupColorPicker";
import {GroupNameField} from "@/components/groups/GroupNameField";
import {GroupSlotIdentifiers} from "@/components/groups/GroupSlotIdentifiers";
import {ActionCard} from "@/components/actions/ActionCard";
import {ActionStatusIcon} from "@/components/actions/ActionStatusIcon";
import {ActionsButton} from "@/components/actions/ActionsButton";
import {ActionsPanel} from "@/components/actions/ActionsPanel";
import {DestinationIcon} from "@/components/actions/DestinationIcon";

// Les noms de composants (`ItemIcon`…), de classes CSS et de jetons restent en
// clair : ce sont des identifiants du code, que l'on cherche tels quels. Tout
// le reste passe par `catalog.*` — ou par la clé existante, quand l'application
// dit déjà la même chose ailleurs.

/** Le sommaire : l'ordre est celui de la page, les titres dans `catalog.sections`. */
export const CATALOG_SECTIONS = [
    "foundations",
    "buttons",
    "icons",
    "symbols",
    "controls",
    "dialogs",
    "items",
    "tooltips",
    "plugs",
    "characters",
    "loadouts",
    "groups",
    "storage",
    "actions",
] as const;

type SectionId = (typeof CATALOG_SECTIONS)[number];

function Section({
                     id,
                     children,
                     note,
                     roomy = false,
                 }: {
    id: SectionId;
    children: ReactNode;
    note?: string;
    /** Spécimens plus larges : les infobulles ont une largeur fixe */
    roomy?: boolean;
}) {
    const t = useTranslations("catalog.sections");
    return (
        <section id={id} className="ui-catalog__section">
            <h2 className="ui-catalog__heading">{t(id)}</h2>
            {note && <p className="ui-catalog__note">{note}</p>}
            <div className={`ui-catalog__specimens${roomy ? " ui-catalog__specimens--roomy" : ""}`}>
                {children}
            </div>
        </section>
    );
}

/** Un spécimen : le composant, son nom et ce qu'il montre. */
function Specimen({
                      name,
                      note,
                      wide = false,
                      children,
                  }: {
    name: string;
    note?: string;
    /** Occupe toute la largeur de la grille */
    wide?: boolean;
    children: ReactNode;
}) {
    return (
        <figure className={`ui-catalog__specimen${wide ? " ui-catalog__specimen--wide" : ""}`}>
            <div className="ui-catalog__stage">{children}</div>
            <figcaption className="ui-catalog__caption">
                <code>{name}</code>
                {note && <span>{note}</span>}
            </figcaption>
        </figure>
    );
}

interface Variant {
    label: string;
    node: ReactNode;
    /**
     * Clé de rendu, quand la légende n'est pas unique : une fois traduites,
     * deux légendes distinctes peuvent se confondre.
     */
    key?: string;
}

/** Une rangée de variantes légendées, à l'intérieur d'un spécimen. */
function Variants({items}: {items: Variant[]}) {
    return (
        <div className="ui-catalog__variants">
            {items.map(({label, node, key}) => (
                <div key={key ?? label} className="ui-catalog__variant">
                    {node}
                    <span className="ui-catalog__variant-label">{label}</span>
                </div>
            ))}
        </div>
    );
}

export function CatalogSections({
                                    profile,
                                    setCounts,
                                }: {
    profile: CatalogProfile;
    setCounts: EquippedSetCounts;
}) {
    return (
        <>
            <FoundationsSection/>
            <ButtonsSection/>
            <IconsSection/>
            <SymbolsSection/>
            <ControlsSection/>
            <DialogsSection/>
            <ItemsSection profile={profile}/>
            <TooltipsSection profile={profile}/>
            <PlugsSection profile={profile}/>
            <CharactersSection profile={profile} setCounts={setCounts}/>
            <LoadoutsSection profile={profile} setCounts={setCounts}/>
            <GroupsSection profile={profile}/>
            <StorageSection profile={profile}/>
            <ActionsSection profile={profile}/>
        </>
    );
}

// —— Fondations ————————————————————————————————————————————————

/** Les jetons de couleur du thème (scss/layout/theme.scss). */
const COLOR_TOKENS = [
    "--color-bg",
    "--color-panel",
    "--color-panel-alt",
    "--color-border",
    "--color-border-strong",
    "--color-text",
    "--color-text-muted",
    "--color-accent",
    "--color-accent-contrast",
    "--color-danger",
    "--color-success",
    "--color-energy",
    "--color-overlay",
    "--color-icon-surface",
    "--color-icon-border",
];

const TIER_TOKENS = [
    "--tier-basic",
    "--tier-common",
    "--tier-rare",
    "--tier-legendary",
    "--tier-exotic",
];

function Swatches({tokens}: {tokens: string[]}) {
    return (
        <div className="ui-catalog__swatches">
            {tokens.map((token) => (
                <div key={token} className="ui-catalog__swatch">
                    {/* Valeur dynamique : la variable elle-même, résolue par le thème */}
                    <span className="ui-catalog__chip" style={{background: `var(${token})`}}/>
                    <code>{token}</code>
                </div>
            ))}
        </div>
    );
}

function FoundationsSection() {
    const t = useTranslations("catalog");
    const tAppearance = useTranslations("settings.appearance");
    const tCriteria = useTranslations("criteria");
    const theme = useSettings((s) => s.theme);
    const setTheme = useSettings((s) => s.setTheme);
    const effects = useSettings((s) => s.visualEffects);
    const setEffects = useSettings((s) => s.setVisualEffects);

    return (
        <Section id="foundations" note={t("notes.foundations")}>
            <Specimen name={tAppearance("theme")} wide>
                <div className="ui-catalog__row">
                    <Select
                        id="catalog-theme"
                        value={theme}
                        onChange={setTheme}
                        options={(["system", "dark", "light"] as const).map((value) => ({
                            value,
                            label: tAppearance(`themes.${value}`),
                        }))}
                    />
                    <Toggle
                        id="catalog-effects"
                        checked={effects}
                        onChange={setEffects}
                        label={tAppearance("effects")}
                    />
                </div>
            </Specimen>
            <Specimen name={t("captions.colors")} note="scss/layout/theme.scss" wide>
                <Swatches tokens={COLOR_TOKENS}/>
            </Specimen>
            <Specimen name={tCriteria("rarity")} note="--tier-*">
                <Swatches tokens={TIER_TOKENS}/>
            </Specimen>
            <Specimen name={t("captions.typography")} note="--font-sans, --font-mono">
                <div className="ui-catalog__type">
                    <h1>{t("sample.headingLevel", {level: 1})}</h1>
                    <h2>{t("sample.headingLevel", {level: 2})}</h2>
                    <h3>{t("sample.headingLevel", {level: 3})}</h3>
                    <p>
                        {t.rich("sample.body", {
                            link: (chunks) => <a href="#foundations">{chunks}</a>,
                        })}
                    </p>
                    <p className="ui-catalog__muted">{t("sample.muted")}</p>
                    <code>{t("sample.code", {value: CATALOG_HASH.fatebringerTimelost})}</code>
                </div>
            </Specimen>
            <Specimen name=".skeleton" note={t("captions.skeleton")}>
                <div className="ui-catalog__skeletons">
                    <span className="skeleton ui-catalog__skeleton--line"/>
                    <span className="skeleton ui-catalog__skeleton--short"/>
                    <span className="skeleton ui-catalog__skeleton--square"/>
                </div>
            </Specimen>
        </Section>
    );
}

// —— Boutons ——————————————————————————————————————————————————

function ButtonsSection() {
    const t = useTranslations("catalog");
    const tCommon = useTranslations("common");
    const tHeader = useTranslations("header");

    return (
        <Section id="buttons">
            <Specimen name=".btn" note={t("captions.btnRegular")} wide>
                <div className="ui-catalog__row">
                    <button type="button" className="btn">{t("sample.regular")}</button>
                    <button type="button" className="btn btn--primary">{t("sample.primary")}</button>
                    <button type="button" className="btn btn--danger">{t("sample.danger")}</button>
                    <button type="button" className="btn" disabled>{t("sample.disabled")}</button>
                    <button type="button" className="btn btn--primary" disabled>
                        {t("sample.primaryDisabled")}
                    </button>
                </div>
            </Specimen>
            <Specimen name=".btn--small" note={t("captions.btnSmall")} wide>
                <div className="ui-catalog__row">
                    <button type="button" className="btn btn--small">{t("sample.small")}</button>
                    <button type="button" className="btn btn--small btn--primary">{t("sample.primary")}</button>
                    <button type="button" className="btn btn--small btn--danger">
                        <TrashIcon aria-hidden/> {tCommon("delete")}
                    </button>
                    <button type="button" className="btn btn--small btn--refresh" aria-label={tHeader("refresh")}>
                        <ArrowPathIcon aria-hidden/>
                    </button>
                    <button type="button" className="btn btn--small btn--settings" aria-label={tCommon("settings")}>
                        <Cog6ToothIcon aria-hidden/>
                    </button>
                    <button type="button" className="btn btn--small" disabled>{t("sample.disabled")}</button>
                </div>
            </Specimen>
            <Specimen name="MainMenuButton" note={t("captions.mainMenuButton")}>
                <MainMenuButton/>
            </Specimen>
            <Specimen name="ActionsButton" note={t("captions.actionsButton")}>
                <ActionsButton/>
            </Specimen>
            <Specimen name="SearchToggle" note={t("captions.searchToggle")}>
                <SearchToggleDemo/>
            </Specimen>
            <Specimen name="Hint" note={t("captions.hint")}>
                <Hint
                    actions={[
                        {label: tHeader("refresh"), keys: ["mouseLeft"]},
                        {label: tHeader("refreshForce"), keys: ["mouseRight"], note: tHeader("holdHint")},
                    ]}
                >
                    <button type="button" className="btn btn--small btn--refresh" aria-label={tHeader("refresh")}>
                        <ArrowPathIcon aria-hidden/>
                    </button>
                </Hint>
            </Specimen>
        </Section>
    );
}

function SearchToggleDemo() {
    const [open, setOpen] = useState(false);
    return <SearchToggle open={open} onToggle={() => setOpen((o) => !o)}/>;
}

// —— Icônes ———————————————————————————————————————————————————

/**
 * DestinyItemSubType des armes, et la munition qui départage les
 * lance-grenades. `key` désigne la légende dans `catalog.weaponTypes`.
 */
const WEAPON_SUBTYPES = [
    {key: "autoRifle", subType: 6},
    {key: "shotgun", subType: 7},
    {key: "machineGun", subType: 8},
    {key: "handCannon", subType: 9},
    {key: "rocketLauncher", subType: 10},
    {key: "fusionRifle", subType: 11},
    {key: "sniperRifle", subType: 12},
    {key: "pulseRifle", subType: 13},
    {key: "scoutRifle", subType: 14},
    {key: "sidearm", subType: 17},
    {key: "sword", subType: 18},
    {key: "linearFusionRifle", subType: 22},
    {key: "grenadeLauncherSpecial", subType: 23, ammoType: 2},
    {key: "grenadeLauncherHeavy", subType: 23, ammoType: 3},
    {key: "submachineGun", subType: 24},
    {key: "traceRifle", subType: 25},
    {key: "bow", subType: 31},
    {key: "glaive", subType: 33},
] as const;

function IconsSection() {
    const t = useTranslations("catalog");
    const tAmmo = useTranslations("inventory.ammo");

    return (
        <Section id="icons" note={t("notes.icons")}>
            <Specimen name="components/icons" note={t("captions.uiIcons")} wide>
                <Variants
                    items={[
                        {label: "LoadingIcon", node: <LoadingIcon className="ui-catalog__icon"/>},
                        {label: "VaultIcon", node: <VaultIcon className="ui-catalog__icon"/>},
                        {label: "PostmasterIcon", node: <PostmasterIcon className="ui-catalog__icon"/>},
                        {label: "LoadoutsIcon", node: <LoadoutsIcon className="ui-catalog__icon"/>},
                        {label: "SearchIcon", node: <SearchIcon className="ui-catalog__icon"/>},
                        {label: "EmptySlotIcon", node: <EmptySlotIcon className="ui-catalog__icon"/>},
                        {label: "BorderIcon", node: <BorderIcon className="ui-catalog__icon"/>},
                        {label: "EnhancedPerkIcon", node: <EnhancedPerkIcon className="ui-catalog__icon"/>},
                    ]}
                />
            </Specimen>
            <Specimen name="AmmoIcon">
                <Variants
                    items={(["primary", "special", "heavy"] as const).map((kind, i) => ({
                        label: tAmmo(`${kind}Short`),
                        node: <AmmoIcon ammoType={i + 1} className="ui-catalog__icon"/>,
                    }))}
                />
            </Specimen>
            <Specimen name="ClassSymbol / ClassIcon">
                <Variants
                    items={[0, 1, 2].flatMap((classType) => [
                        {
                            label: `ClassSymbol ${classType}`,
                            node: <ClassSymbol classType={classType} className="ui-catalog__icon"/>,
                        },
                        {
                            label: `ClassIcon ${classType}`,
                            node: <ClassIcon classType={classType}/>,
                        },
                    ])}
                />
            </Specimen>
            <Specimen name="WeaponTypeIcon" wide>
                <Variants
                    items={WEAPON_SUBTYPES.map((weapon) => ({
                        label: t(`weaponTypes.${weapon.key}`),
                        node: (
                            <WeaponTypeIcon
                                subType={weapon.subType}
                                ammoType={"ammoType" in weapon ? weapon.ammoType : undefined}
                                className="ui-catalog__icon"
                            />
                        ),
                    }))}
                />
            </Specimen>
        </Section>
    );
}

function SymbolsSection() {
    const t = useTranslations("catalog");
    const [filter, setFilter] = useState("");
    const glyphs = useMemo(
        () =>
            (Object.keys(DESTINY_GLYPHS) as DestinyGlyphName[]).filter((name) =>
                name.includes(filter.trim().toLowerCase()),
            ),
        [filter],
    );
    return (
        <Section id="symbols" note={t("notes.symbols")}>
            <Specimen name="DestinySymbol" note={t("captions.compounds")} wide>
                <Variants
                    items={(Object.keys(DESTINY_SYMBOLS) as DestinySymbolName[]).map((name) => ({
                        label: name,
                        node: <DestinySymbol name={name} className="ui-catalog__glyph"/>,
                    }))}
                />
            </Specimen>
            <Specimen name="DESTINY_GLYPHS" note={t("captions.glyphCount", {count: glyphs.length})} wide>
                <input
                    type="search"
                    className="ui-catalog__filter"
                    placeholder={t("sample.filterGlyphs")}
                    aria-label={t("sample.filterGlyphs")}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <div className="ui-catalog__glyphs">
                    {glyphs.map((name) => (
                        <div key={name} className="ui-catalog__glyph-cell" title={name}>
                            <DestinySymbol name={name} className="ui-catalog__glyph"/>
                            <span>{name}</span>
                        </div>
                    ))}
                </div>
            </Specimen>
        </Section>
    );
}

// —— Contrôles ————————————————————————————————————————————————

function ControlsSection() {
    const t = useTranslations("catalog");
    const tAppearance = useTranslations("settings.appearance");
    const tSort = useTranslations("settings.inventory");
    const tGroups = useTranslations("groups");
    const [checked, setChecked] = useState(true);
    const [choice, setChoice] = useState<"1" | "2" | "3">("1");
    const [size, setSize] = useState(64);
    const [color, setColor] = useState<string | undefined>("#f5b820");
    // Le nom d'exemple suit la langue tant qu'on n'y a pas touché
    const [name, setName] = useState<string | null>(null);
    const [identifiers, setIdentifiers] = useState<LoadoutIdentifierHashes>({
        colorHash: 1677044031,
        iconHash: 797343697,
        nameHash: 752612097,
    });

    return (
        <Section id="controls" note={t("notes.controls")}>
            <Specimen name="Toggle">
                <Variants
                    items={[
                        {
                            key: "toggle",
                            label: checked ? t("sample.on") : t("sample.off"),
                            node: (
                                <Toggle
                                    id="catalog-toggle"
                                    checked={checked}
                                    onChange={setChecked}
                                    label={t("sample.toggle")}
                                />
                            ),
                        },
                        {
                            key: "always-off",
                            label: t("sample.alwaysOff"),
                            node: (
                                <Toggle
                                    id="catalog-toggle-off"
                                    checked={false}
                                    onChange={() => {}}
                                    label={t("sample.off")}
                                />
                            ),
                        },
                    ]}
                />
            </Specimen>
            <Specimen name="Select">
                <Select
                    id="catalog-select"
                    value={choice}
                    onChange={setChoice}
                    options={(["1", "2", "3"] as const).map((value) => ({
                        value,
                        label: t("sample.option", {number: value}),
                    }))}
                />
            </Specimen>
            <Specimen name="SettingRow" note={t("captions.settingRow")} wide>
                <div className="ui-catalog__settings">
                    <SettingRow
                        label={tAppearance("ornaments")}
                        hint={tAppearance("ornamentsHint")}
                        htmlFor="catalog-row"
                    >
                        <Toggle
                            id="catalog-row"
                            checked={checked}
                            onChange={setChecked}
                            label={tAppearance("ornaments")}
                        />
                    </SettingRow>
                    <SettingRow label={tAppearance("iconSize")} htmlFor="catalog-size">
                        <IconSizeControl id="catalog-size" value={size} onChange={setSize} unitLabel="px"/>
                    </SettingRow>
                </div>
            </Specimen>
            <Specimen name="SizePreview" note={tAppearance("preview")}>
                <SizePreview/>
            </Specimen>
            <Specimen name="ViewModeTabs">
                <ViewModeTabs/>
            </Specimen>
            <Specimen name="ItemCategoryTabs">
                <ItemCategoryTabs/>
            </Specimen>
            <Specimen name="SearchBar" note={t("captions.searchBar")} wide>
                <div className="ui-catalog__search">
                    <SearchBar expanded/>
                </div>
            </Specimen>
            <Specimen name="SortRuleList" note={tSort("sort")} wide>
                <SortRuleList/>
            </Specimen>
            <Specimen name="GroupNameField">
                <GroupNameField
                    name={name ?? t("sample.groupName")}
                    label={tGroups("nameLabel")}
                    onRename={setName}
                />
            </Specimen>
            <Specimen name="GroupColorPicker">
                <GroupColorPicker value={color} onChange={setColor}/>
            </Specimen>
            <Specimen name="GroupSlotIdentifiers" note={t("captions.slotIdentifiers")} wide>
                <GroupSlotIdentifiers identifiers={identifiers} slotNumber={2} onChange={setIdentifiers}/>
            </Specimen>
        </Section>
    );
}

// —— Fenêtres et menus ———————————————————————————————————————————

/**
 * Nom Bungie montré par le menu et les paramètres. Un nom de joueur n'a pas de
 * langue : il reste tel quel.
 */
const SAMPLE_DISPLAY_NAME = "Guardian#0000";

function DialogsSection() {
    const t = useTranslations("catalog");
    const tCommon = useTranslations("common");
    const tMenu = useTranslations("menu");
    const tAmount = useTranslations("actions.amount");
    const [modal, setModal] = useState<"regular" | "compact" | "amount" | "settings" | null>(null);
    const setMenuOpen = useUi((s) => s.setMenuOpen);
    const setPanelOpen = useActionQueue((s) => s.setPanelOpen);
    const close = () => setModal(null);

    const openButton = (onClick: () => void) => (
        <button type="button" className="btn btn--small" onClick={onClick}>
            {tCommon("open")}
        </button>
    );

    return (
        <Section id="dialogs">
            <Specimen name="Modal" note={t("captions.modal")}>
                <div className="ui-catalog__row">
                    <button type="button" className="btn btn--small" onClick={() => setModal("regular")}>
                        {t("sample.modal")}
                    </button>
                    <button type="button" className="btn btn--small" onClick={() => setModal("compact")}>
                        {t("sample.compactModal")}
                    </button>
                </div>
            </Specimen>
            <Specimen name="AmountPrompt" note={tAmount("title")}>
                {openButton(() => setModal("amount"))}
            </Specimen>
            <Specimen name="SettingsModal" note={t("captions.realSettings")}>
                {openButton(() => setModal("settings"))}
            </Specimen>
            <Specimen name="MainMenu" note={tMenu("label")}>
                {openButton(() => setMenuOpen(true))}
            </Specimen>
            <Specimen name="ActionsPanel" note={t("captions.actionsPanel")}>
                {openButton(() => setPanelOpen(true))}
            </Specimen>

            <Modal open={modal === "regular"} onClose={close} title={t("sample.modalTitle")}>
                <p>{t("sample.modalBody")}</p>
            </Modal>
            <Modal open={modal === "compact"} onClose={close} title={t("sample.compactTitle")} compact>
                <p>{t("sample.compactBody")}</p>
                <div className="ui-catalog__row">
                    <button type="button" className="btn btn--small" onClick={close}>
                        {tCommon("cancel")}
                    </button>
                    <button type="button" className="btn btn--small btn--primary" onClick={close}>
                        {tCommon("confirm")}
                    </button>
                </div>
            </Modal>
            {modal === "amount" && (
                <AmountPrompt
                    itemHash={CATALOG_HASH.enhancementCore}
                    max={250}
                    onConfirm={close}
                    onCancel={close}
                />
            )}
            <SettingsModal open={modal === "settings"} onClose={close} displayName={SAMPLE_DISPLAY_NAME}/>
            <MainMenu displayName={SAMPLE_DISPLAY_NAME}/>
            <ActionsPanel/>
        </Section>
    );
}

// —— Vignettes ————————————————————————————————————————————————

function ItemsSection({profile}: {profile: CatalogProfile}) {
    const t = useTranslations("catalog");
    const tCriteria = useTranslations("criteria");
    const {byId, stacks, data} = profile;
    const sample = byId.get("v-fatebringer")!;
    const hunter = CATALOG_CHARACTER.hunter;
    const kinetic = data.equipment[hunter].find((item) => item.bucketHash === BUCKET.KineticWeapons);
    const kineticInventory = data.inventory[hunter].filter((item) => item.bucketHash === BUCKET.KineticWeapons);

    const icon = (id: string) => {
        const item = byId.get(id)!;
        return (
            <ItemIcon
                itemHash={item.itemHash}
                itemInstanceId={item.itemInstanceId}
                state={item.state}
                gearTier={data.items[id]?.instance?.gearTier}
                bucketHash={item.bucketHash}
            />
        );
    };

    const stackLabel = (bucketHash: number, quantity: number) =>
        bucketHash === BUCKET.Engrams
            ? t("showcase.engram")
            : bucketHash === BUCKET.Postmaster
              ? t("sample.lostStack", {count: quantity})
              : t("sample.stack", {count: quantity});

    return (
        <Section id="items" note={t("notes.items")}>
            <Specimen name="ItemIcon" note={t("captions.natures")} wide>
                <Variants
                    items={CATALOG_SHOWCASE.map(({key, id}) => ({
                        key: id,
                        label: t(`showcase.${key}`),
                        node: icon(id),
                    }))}
                />
            </Specimen>
            <Specimen name="ItemIcon" note={`${tCriteria("gearTier")} (gearTier)`} wide>
                <Variants
                    items={[undefined, 1, 2, 3, 4, 5].map((tier) => ({
                        label: tier ? t("sample.tier", {tier}) : t("sample.noTier"),
                        node: (
                            <ItemIcon
                                itemHash={sample.itemHash}
                                itemInstanceId={sample.itemInstanceId}
                                gearTier={tier}
                            />
                        ),
                    }))}
                />
            </Specimen>
            <Specimen name="ItemThumb" note={t("captions.states")} wide>
                <Variants
                    items={[
                        {label: tCriteria("none"), state: 0},
                        {label: tCriteria("masterwork"), state: ITEM_STATE.Masterwork},
                        {label: t("sample.locked"), state: ITEM_STATE.Locked},
                        {label: t("sample.crafted"), state: ITEM_STATE.Crafted},
                        {label: t("sample.enhanced"), state: ITEM_STATE.Enhanced},
                        {label: t("sample.tracked"), state: ITEM_STATE.Tracked},
                        {
                            label: t("sample.all"),
                            state: ITEM_STATE.Masterwork | ITEM_STATE.Locked | ITEM_STATE.Crafted,
                        },
                    ].map(({label, state}) => ({
                        key: String(state),
                        label,
                        node: (
                            <span className="item">
                                <ItemThumb itemHash={sample.itemHash} state={state} gearTier={3}/>
                            </span>
                        ),
                    }))}
                />
            </Specimen>
            <Specimen name="ItemThumb" note={t("captions.equippedAndStacks")} wide>
                <Variants
                    items={[
                        {
                            key: "equipped",
                            label: t("sample.equipped"),
                            node: (
                                <span className="item">
                                    <ItemThumb itemHash={sample.itemHash} equipped/>
                                </span>
                            ),
                        },
                        ...stacks.map((stack) => ({
                            // Deux piles peuvent porter la même légende : la
                            // clé tient au hash et à l'emplacement.
                            key: `${stack.itemHash}/${stack.bucketHash}`,
                            label: stackLabel(stack.bucketHash, stack.quantity),
                            node: (
                                <ItemIcon
                                    itemHash={stack.itemHash}
                                    quantity={stack.quantity}
                                    bucketHash={stack.bucketHash}
                                />
                            ),
                        })),
                    ]}
                />
            </Specimen>
            <Specimen name="ItemIcon" note={t("captions.moving")}>
                {icon("c-skyburner")}
            </Specimen>
            <Specimen name="EquipmentSlot" note={t("captions.equipmentSlot")} wide>
                <div className="slot-column slot-column--left ui-catalog__slot">
                    <EquipmentSlot
                        bucketHash={BUCKET.KineticWeapons}
                        equipped={kinetic}
                        inventory={kineticInventory}
                        details={data.items}
                        side="left"
                    />
                </div>
            </Specimen>
        </Section>
    );
}

// —— Infobulles ———————————————————————————————————————————————

/** `key` désigne la légende dans `catalog.showcase`. */
const TOOLTIP_SAMPLES: {key: string; id?: string; hash?: number}[] = [
    {key: "exoticWeapon", id: "c-cloudstrike"},
    {key: "adeptWeapon", id: "c-fatebringer-t"},
    {key: "holofoilWeapon", id: "c-mountaintop"},
    {key: "setArmor", id: "c-cowl"},
    {key: "exoticArmor", id: "c-omnioculus"},
    {key: "subclass", id: "c-sub-hunter"},
    {key: "artifact", id: "c-artifact"},
    {key: "ghost", id: "c-ghost"},
    {key: "engram", hash: CATALOG_HASH.encryptedEngram},
    {key: "material", hash: CATALOG_HASH.ascendantShard},
];

function TooltipsSection({profile}: {profile: CatalogProfile}) {
    const t = useTranslations("catalog");
    const {byId} = profile;
    return (
        <Section id="tooltips" note={t("notes.tooltips")} roomy>
            {TOOLTIP_SAMPLES.map(({key, id, hash}) => {
                const item = id ? byId.get(id) : undefined;
                return (
                    <Specimen key={key} name="ItemTooltip" note={t(`showcase.${key}`)}>
                        <div className="floating-layer ui-catalog__floating">
                            <ItemTooltip
                                itemHash={item?.itemHash ?? hash!}
                                itemInstanceId={item?.itemInstanceId}
                                state={item?.state}
                                gearTier={id ? profile.data.items[id]?.instance?.gearTier : undefined}
                            />
                        </div>
                    </Specimen>
                );
            })}
            <Specimen name="TooltipSkeleton" note={t("captions.skeletons")}>
                <div className="ui-catalog__column">
                    {(["weapon", "armor", "other"] as const).map((kind) => (
                        <div key={kind} className="floating-layer ui-catalog__floating">
                            <TooltipSkeleton kind={kind}/>
                        </div>
                    ))}
                </div>
            </Specimen>
        </Section>
    );
}

// —— Attributs et statistiques ———————————————————————————————————

function PlugsSection({profile}: {profile: CatalogProfile}) {
    const t = useTranslations("catalog");
    const tStatus = useTranslations("actions.status");
    const tInventory = useTranslations("inventory");
    const {data} = profile;
    const weapon = data.items["c-fatebringer-t"];
    const {defs} = useItemDefs();
    // Les colonnes d'attributs aléatoires de l'arme : celles qui proposent un choix
    const columns = Object.entries(weapon.reusablePlugs).filter(([, options]) => options.length > 1);
    const perk = columns[0]?.[1][0];
    const hunter = data.characters[0];
    const equipped = data.equipment[CATALOG_CHARACTER.hunter];

    return (
        <Section id="plugs">
            <Specimen name="PlugIcon" note={t("captions.plugIcons")} wide>
                <Variants
                    items={[
                        ...columns.flatMap(([index, options]) =>
                            options.slice(0, 2).map((hash, i) => ({
                                label: t(i === 0 ? "sample.socketEquipped" : "sample.socketAvailable", {index}),
                                node: (
                                    <PlugIcon
                                        hash={hash}
                                        def={defs.get(hash)}
                                        state={i === 0 ? "equipped" : "available"}
                                    />
                                ),
                            })),
                        ),
                        ...weapon.sockets.slice(5, 9).map((hash, i) => ({
                            label: t("sample.square", {index: i + 5}),
                            node: <PlugIcon hash={hash} square state="equipped"/>,
                        })),
                        {
                            label: t("sample.selected"),
                            node: perk ? <PlugIcon hash={perk} state="equipped" selected/> : null,
                        },
                        {
                            label: tStatus("pending"),
                            node: perk ? <PlugIcon hash={perk} state="available" busy/> : null,
                        },
                    ]}
                />
            </Specimen>
            {perk !== undefined && (
                <Specimen name="PlugTooltip" note={t("captions.plugTooltip")}>
                    <div className="floating-layer ui-catalog__floating">
                        <PlugTooltip hash={perk} typeLabel={t("sample.perk")} equippable/>
                    </div>
                </Specimen>
            )}
            <Specimen name="StatBar" note={t("captions.weaponStats")} wide>
                <div className="ui-catalog__stats">
                    {Object.entries(weapon.stats)
                        .slice(0, 5)
                        .map(([hash, value]) => (
                            <StatBar key={hash} statHash={Number(hash)} value={value} max={100}/>
                        ))}
                    <StatBar statHash={4284893193} value={140} max={100} withBar={false}/>
                    <StatBar statHash={4043523819} value={-10} max={100} signed/>
                </div>
            </Specimen>
            <Specimen name="StatBar" note={t("captions.armorStats", {max: ARMOR_STAT_MAX})}>
                <div className="ui-catalog__stats">
                    {ARMOR_STAT_ORDER.map((hash, i) => (
                        <StatBar
                            key={hash}
                            statHash={hash}
                            value={[30, 25, 13, 5, 0, 0][i]}
                            max={ARMOR_STAT_MAX}
                            tuned={i === 2}
                        />
                    ))}
                </div>
            </Specimen>
            <Specimen
                name="StatBar"
                note={t("captions.characterStats", {max: CHARACTER_STAT_MAX, marker: CHARACTER_STAT_ENHANCED})}
            >
                <div className="ui-catalog__stats">
                    {ARMOR_STAT_ORDER.map((hash) => (
                        <StatBar
                            key={hash}
                            statHash={hash}
                            value={hunter.stats[hash] ?? 0}
                            max={CHARACTER_STAT_MAX}
                            marker={CHARACTER_STAT_ENHANCED}
                            enhanced={
                                (hunter.stats[hash] ?? 0) > CHARACTER_STAT_ENHANCED
                                    ? t("sample.enhancedEffect")
                                    : undefined
                            }
                        />
                    ))}
                </div>
            </Specimen>
            <Specimen name="StatTooltip" note={t("captions.statTooltip")}>
                <div className="floating-layer ui-catalog__floating">
                    <StatTooltip
                        name={t("sample.statName")}
                        description={t("sample.statDescription")}
                        enhanced={t("sample.statEnhanced")}
                    />
                </div>
            </Specimen>
            <Specimen name="CharacterStatsTooltip" note={tInventory("characterStats")} wide>
                <div className="floating-layer ui-catalog__floating">
                    <CharacterStatsTooltip
                        stats={hunter.stats}
                        statHashes={ARMOR_STAT_ORDER}
                        items={equipped}
                        details={data.items}
                    />
                </div>
            </Specimen>
        </Section>
    );
}

// —— Personnages ——————————————————————————————————————————————

function CharactersSection({profile, setCounts}: {profile: CatalogProfile; setCounts: EquippedSetCounts}) {
    const t = useTranslations("catalog.captions");
    const {data} = profile;
    const [selected, setSelected] = useState<string>(CATALOG_CHARACTER.hunter);
    const hunter = data.characters[0];

    return (
        <Section id="characters">
            <Specimen name="CharacterTab" note={t("characterTab")} wide>
                <div className="ui-catalog__row">
                    <CharacterTab character={data.characters[0]} selected/>
                    <CharacterTab character={data.characters[1]} selected={false}/>
                    <CharacterTab character={data.characters[2]} selected={false} passive/>
                </div>
            </Specimen>
            <Specimen name="CharacterPicker" note={t("pickerSquare")} wide>
                <CharacterPicker characters={data.characters} selectedId={selected} onSelect={setSelected}/>
            </Specimen>
            <Specimen name="CharacterPicker" note={t("pickerFull")} wide>
                <CharacterPicker characters={data.characters} selectedId={selected} onSelect={setSelected} full/>
            </Specimen>
            <Specimen name="CharacterSummary" note={t("characterSummary")} wide>
                <CharacterSummary
                    stats={hunter.stats}
                    setCounts={setCounts}
                    items={data.equipment[CATALOG_CHARACTER.hunter]}
                    details={data.items}
                />
            </Specimen>
        </Section>
    );
}

// —— Équipements ——————————————————————————————————————————————

function LoadoutsSection({profile, setCounts}: {profile: CatalogProfile; setCounts: EquippedSetCounts}) {
    const t = useTranslations("catalog");
    const tGroups = useTranslations("groups");
    const tInventory = useTranslations("inventory");
    const {data} = profile;
    const {defs} = useItemDefs();
    const hunter = CATALOG_CHARACTER.hunter;
    const loadouts = data.loadouts![hunter];
    const identifiers = useLoadoutIdentifiers(loadouts);
    const [selected, setSelected] = useState<number | null>(0);
    const equipped = data.equipment[hunter];

    return (
        <Section id="loadouts" note={t("notes.loadouts")}>
            <Specimen name="LoadoutSlotTile" note={t("captions.slotTile")}>
                {/* Une tuile vit dans un bouton de la grille du panneau, dont
                    elle prend la taille : sans eux, elle n'en a aucune. */}
                <div className="loadout-panel ui-catalog__tiles">
                    <div className="loadout-panel__grid">
                        {[0, 1, 5].map((index) => (
                            <span
                                key={index}
                                className={`loadout-slot${index === 5 ? " loadout-slot--empty" : ""}`}
                            >
                                <LoadoutSlotTile loadout={loadouts[index]} index={index} identifiers={identifiers}/>
                            </span>
                        ))}
                    </div>
                </div>
            </Specimen>
            <Specimen name="LoadoutSlotHeading" note={t("captions.slotHeading")}>
                <LoadoutSlotHeading
                    loadout={loadouts[0]}
                    index={0}
                    identifiers={identifiers}
                    label={tGroups("previewing")}
                />
            </Specimen>
            <Specimen name="LoadoutTitle" note={t("captions.loadoutTitle")} wide>
                <div className="ui-catalog__column">
                    <LoadoutTitle loadout={loadouts[0]} index={0} characterId={hunter} empty={false}/>
                    <LoadoutTitle loadout={loadouts[5]} index={5} characterId={hunter} empty/>
                </div>
            </Specimen>
            <Specimen name="LoadoutPanel" note={t("captions.loadoutPanel")} wide>
                <div className="ui-catalog__panel">
                    <LoadoutPanel
                        loadouts={loadouts}
                        characterId={hunter}
                        selected={selected}
                        onSelect={setSelected}
                    />
                </div>
            </Specimen>
            <Specimen name="EquipmentModeView" note={t("captions.equipmentView")} wide>
                <EquipmentModeView
                    title={<h3 className="ui-catalog__view-title">{tInventory("currentEquipment")}</h3>}
                    items={equipped}
                    details={data.items}
                    defs={defs}
                    setCounts={setCounts}
                    characterStats={data.characters[0].stats}
                    editable
                />
            </Specimen>
        </Section>
    );
}

// —— Groupes ——————————————————————————————————————————————————

function GroupsSection({profile}: {profile: CatalogProfile}) {
    const t = useTranslations("catalog");
    const tGroups = useTranslations("groups");
    const {data} = profile;
    const loadouts = data.loadouts![CATALOG_CHARACTER.hunter];
    const identifiers = useLoadoutIdentifiers(loadouts);
    const [selected, setSelected] = useState<number | null>(0);
    const [order, setOrder] = useState(loadouts);
    const noop = () => {};

    return (
        <Section id="groups" note={t("notes.groups")}>
            <Specimen name="StaticGroupCard" note={t("captions.groupCard")} wide>
                <StaticGroupCard
                    name={t("sample.groupName")}
                    loadouts={loadouts}
                    slotCount={loadouts.length}
                    identifiers={identifiers}
                    onEquip={noop}
                    onEdit={noop}
                    onShare={noop}
                    onDuplicate={noop}
                    onDelete={noop}
                    onOpen={noop}
                />
            </Specimen>
            <Specimen name="StaticGroupCard" note={t("captions.gameCard")} wide>
                <StaticGroupCard
                    name={tGroups("currentLoadouts")}
                    loadouts={loadouts}
                    slotCount={loadouts.length}
                    identifiers={identifiers}
                    onEdit={noop}
                    onOpen={noop}
                />
            </Specimen>
            <Specimen name="GroupSlotGrid" note={t("captions.slotGrid")} wide>
                <GroupSlotGrid
                    title={tGroups("groupSlots")}
                    loadouts={order}
                    slotCount={order.length}
                    identifiers={identifiers}
                    selected={selected}
                    onSelect={setSelected}
                    onMove={(from, to) =>
                        setOrder((list) => {
                            const next = [...list];
                            const [moved] = next.splice(from, 1);
                            next.splice(to, 0, moved);
                            return next;
                        })
                    }
                    emptyHint={t("sample.dropHint")}
                />
            </Specimen>
        </Section>
    );
}

// —— Coffre ———————————————————————————————————————————————————

function StorageSection({profile}: {profile: CatalogProfile}) {
    const t = useTranslations("catalog");
    const tInventory = useTranslations("inventory");
    const tCommon = useTranslations("common");
    const {data} = profile;
    const [collapsed, setCollapsed] = useState(false);
    const capacities = useBucketCapacities();
    const toggleLabels = {expandLabel: tCommon("expand"), collapseLabel: tCommon("collapse")};

    return (
        <Section id="storage">
            <Specimen name="GroupHeader" note={t("captions.groupHeader")} wide>
                <div className="ui-catalog__column ui-catalog__headers">
                    <GroupHeader
                        kind="root"
                        label={tInventory("vault")}
                        icon={{kind: "vault"}}
                        count={{total: 1250, max: 1300, alert: 1200}}
                        collapsed={collapsed}
                        onToggle={() => setCollapsed((c) => !c)}
                        {...toggleLabels}
                    />
                    <GroupHeader
                        kind="section"
                        label={t("sample.postmaster")}
                        icon={{kind: "postmaster"}}
                        count={{total: 18, max: 21, alert: 16}}
                        collapsed={false}
                        onToggle={() => {}}
                        {...toggleLabels}
                    />
                    <GroupHeader
                        kind="group"
                        label={t("sample.handCannons")}
                        icon={{kind: "weaponType", subType: 9, ammoType: 1}}
                        count={{total: 12, found: 3}}
                        collapsed={false}
                        onToggle={() => {}}
                        {...toggleLabels}
                    />
                    <GroupHeader
                        kind="group"
                        label={t("sample.hunter")}
                        icon={{kind: "class", classType: 1}}
                        count={{total: 7}}
                        collapsed
                        onToggle={() => {}}
                        {...toggleLabels}
                    />
                </div>
            </Specimen>
            <Specimen name="VirtualItemGrid" note={t("captions.vaultGrid")} wide>
                <div className="ui-catalog__vault">
                    <VirtualItemGrid
                        title={tInventory("vault")}
                        items={data.vault}
                        details={data.items}
                        category="equipment"
                        fill={{total: data.vault.length, max: 1300, alert: 1200}}
                        capacities={capacities}
                    />
                </div>
            </Specimen>
        </Section>
    );
}

// —— File d'actions ———————————————————————————————————————————

const STATUSES: ActionStatus[] = ["pending", "running", "done", "error"];

function ActionsSection({profile}: {profile: CatalogProfile}) {
    const t = useTranslations("catalog");
    const tStatus = useTranslations("actions.status");
    const tInventory = useTranslations("inventory");
    const tCommon = useTranslations("common");
    const {data} = profile;
    const actions = useActionQueue((s) => s.actions);
    const names = useCharacterNames(data.characters);

    const destinations = [
        {key: "vault", label: tInventory("vault"), target: {kind: "vault"} as const},
        {
            key: "inventory",
            label: tCommon("inventory"),
            target: {kind: "inventory", characterId: CATALOG_CHARACTER.titan} as const,
        },
        {
            key: "equipped",
            label: t("sample.equipped"),
            target: {kind: "equipped", characterId: CATALOG_CHARACTER.warlock} as const,
        },
    ];

    return (
        <Section id="actions" note={t("notes.actions")}>
            <Specimen name="ActionStatusIcon">
                <Variants
                    items={STATUSES.map((status) => ({
                        key: status,
                        label: tStatus(status),
                        node: <ActionStatusIcon status={status} labelled={false}/>,
                    }))}
                />
            </Specimen>
            <Specimen name="DestinationIcon">
                <Variants
                    items={destinations.map(({key, label, target}) => ({
                        key,
                        label,
                        node: <DestinationIcon target={target} characters={data.characters} label={label}/>,
                    }))}
                />
            </Specimen>
            <Specimen name="ActionCard" note={t("captions.actionCard")} wide>
                {/* La liste seule : le tiroir `.actions-panel` est positionné et
                    masqué hors de son état ouvert. */}
                <ol className="actions-panel__list ui-catalog__actions">
                    {actions.map((action) => (
                        <ActionCard key={action.id} action={action} characters={data.characters} names={names}/>
                    ))}
                </ol>
            </Specimen>
        </Section>
    );
}
