"use client";

import {useEffect, useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import type {ProfileData} from "@/lib/bungie/use-profile";
import type {InventoryItemDefinition} from "@/lib/destiny/types";
import {ARMOR_COLUMN, WEAPON_COLUMN} from "@/lib/destiny/buckets";
import {ItemDefsProvider, useSharedDefinition, type ItemRef} from "@/lib/destiny/item-defs";
import {getDefinitions} from "@/lib/manifest/manifest";
import {useLoadoutGroups} from "@/lib/loadouts/groups/store";
import {GROUP_NAME_MAX} from "@/lib/loadouts/groups/types";
import {
    defaultPicks,
    importChoices,
    importDefinitionHashes,
    importLoadouts,
    shareClassType,
    type AccountItem,
    type ImportChoice,
    type ImportContext,
} from "@/lib/loadouts/share/import";
import {
    parseShareLink,
    type ShareLink,
    type SharedItem,
    type SharedSnapshot,
} from "@/lib/loadouts/share/types";
import {useSettings} from "@/lib/settings/store";
import {Modal} from "@/components/ui/Modal";
import {CharacterPicker} from "@/components/CharacterPicker";
import {ItemThumb} from "@/components/ItemThumb";

/** Où en est la fenêtre : le lien à coller, puis le partage chargé. */
type Step =
    | {status: "link"; error?: "invalidLink" | "notFound" | "failed"}
    | {status: "loading"}
    | {status: "ready"; snapshot: SharedSnapshot; author: string; defs: Map<number, InventoryItemDefinition>};

/** L'ordre des rangées : celui des colonnes de l'équipement. */
const BUCKET_RANK = new Map(
    [...WEAPON_COLUMN, ...ARMOR_COLUMN].map((bucket, index) => [bucket, index]),
);

/**
 * Lit les définitions manquantes et les ajoute à celles du profil.
 *
 * Celles du profil ne couvrent que les objets du compte : ceux du partage, que
 * l'importateur n'a pas forcément, et les attributs enregistrés n'y sont pas.
 */
async function withDefinitions(
    base: ReadonlyMap<number, InventoryItemDefinition>,
    hashes: readonly number[],
): Promise<Map<number, InventoryItemDefinition>> {
    const merged = new Map(base);
    const missing = hashes.filter((hash) => !merged.has(hash));
    if (missing.length === 0) return merged;
    const rows = await getDefinitions<InventoryItemDefinition>(
        "DestinyInventoryItemDefinition",
        missing,
    );
    rows.forEach((row, index) => {
        if (row) merged.set(missing[index], row);
    });
    return merged;
}

/**
 * Charge un partage et les définitions de ses objets, et rend l'étape où la
 * fenêtre en est ensuite — le partage prêt, ou le champ avec son erreur.
 */
async function loadShare(
    target: ShareLink,
    defs: ReadonlyMap<number, InventoryItemDefinition>,
): Promise<Step> {
    try {
        const response = await fetch(
            `/api/shares/${encodeURIComponent(target.id)}?kind=${target.kind}`,
        );
        if (response.status === 404) return {status: "link", error: "notFound"};
        if (!response.ok) throw new Error(String(response.status));
        const {snapshot, author} = (await response.json()) as {
            snapshot: SharedSnapshot;
            author: string;
        };
        // Les définitions des objets du partage, d'abord : ce sont elles qui
        // disent la classe, les ensembles et les emplacements, donc les
        // candidats.
        const merged = await withDefinitions(
            defs,
            snapshot.loadouts.flatMap((loadout) =>
                loadout.items.map((item) => item.itemHash),
            ),
        );
        return {status: "ready", snapshot, author, defs: merged};
    } catch {
        return {status: "link", error: "failed"};
    }
}

/**
 * Importer un partage dans ses propres groupes.
 *
 * Le lien est collé ici, ou arrive tout prêt de la page publique (`initial`).
 * Le partage chargé, chaque objet est rapporté à un objet du compte — voir
 * `importChoices` : l'instance de l'auteur si elle y est, sinon un exemplaire
 * que l'utilisateur choisit parmi ceux proposés.
 *
 * Le groupe est créé pour **un personnage de la classe du partage** : un
 * groupe appartient à un personnage, et des armures de Titan ne s'équipent pas
 * sur un Chasseur. Le personnage regardé est proposé d'office s'il convient.
 */
export function ImportShareDialog({
                                      open,
                                      initial,
                                      data,
                                      defs,
                                      characterId,
                                      onClose,
                                      onImported,
                                  }: {
    open: boolean;
    /** Le partage à charger d'emblée, venu de la page publique */
    initial: ShareLink | null;
    data: ProfileData;
    defs: Map<number, InventoryItemDefinition>;
    /** Le personnage regardé dans la vue des groupes */
    characterId: string | null;
    onClose: () => void;
    /** Le groupe est créé : la vue rejoint le personnage qui l'a reçu */
    onImported: (characterId: string) => void;
}) {
    const t = useTranslations("share.import");
    const tCommon = useTranslations("common");
    const createGroup = useLoadoutGroups((s) => s.createGroup);

    const [link, setLink] = useState("");
    // Un partage reçu de la page publique est chargé d'emblée : la fenêtre
    // s'ouvre déjà en chargement, sans passer par le champ.
    const [step, setStep] = useState<Step>(
        initial ? {status: "loading"} : {status: "link"},
    );

    useEffect(() => {
        if (initial) void loadShare(initial, defs).then(setStep);
        // Une seule fois, au montage : le lien reçu est servi une fois (voir
        // la vue des groupes), et les définitions n'ont pas à relancer l'effet.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const close = () => {
        setStep({status: "link"});
        setLink("");
        onClose();
    };

    return (
        <Modal open={open} onClose={close} title={t("title")} compact>
            <div className="share-import">
                <h2 className="share-import__title">{t("title")}</h2>

                {step.status === "link" && (
                    <form
                        className="share-import__link"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const target = parseShareLink(link);
                            if (!target) {
                                setStep({status: "link", error: "invalidLink"});
                                return;
                            }
                            setStep({status: "loading"});
                            void loadShare(target, defs).then(setStep);
                        }}
                    >
                        <label className="share-import__label" htmlFor="share-import-link">
                            {t("linkLabel")}
                        </label>
                        <div className="share-import__row">
                            <input
                                id="share-import-link"
                                className="share-import__input"
                                value={link}
                                placeholder={t("linkPlaceholder")}
                                autoFocus
                                onChange={(event) => setLink(event.target.value)}
                            />
                            <button
                                type="submit"
                                className="btn btn--small btn--primary"
                                disabled={link.trim().length === 0}
                            >
                                {t("load")}
                            </button>
                        </div>
                        {step.error && (
                            <p className="share-import__message share-import__message--error">
                                {t(step.error)}
                            </p>
                        )}
                    </form>
                )}

                {step.status === "loading" && (
                    <p className="share-import__message">{t("loading")}</p>
                )}

                {step.status === "ready" && (
                    <ImportChoices
                        key={`${step.snapshot.name}:${step.author}`}
                        snapshot={step.snapshot}
                        author={step.author}
                        defs={step.defs}
                        data={data}
                        characterId={characterId}
                        onCancel={close}
                        onConfirm={(target, name, loadouts) => {
                            createGroup({
                                characterId: target,
                                name,
                                color: step.snapshot.color,
                                loadouts,
                            });
                            close();
                            onImported(target);
                        }}
                    />
                )}

                {step.status !== "ready" && (
                    <div className="share-import__actions">
                        <button type="button" className="btn btn--small" onClick={close}>
                            {tCommon("cancel")}
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
}

/**
 * Le partage chargé : le personnage, le nom, et un exemplaire par objet.
 */
function ImportChoices({
                           snapshot,
                           author,
                           defs,
                           data,
                           characterId,
                           onCancel,
                           onConfirm,
                       }: {
    snapshot: SharedSnapshot;
    author: string;
    defs: Map<number, InventoryItemDefinition>;
    data: ProfileData;
    characterId: string | null;
    onCancel: () => void;
    onConfirm: (
        characterId: string,
        name: string,
        loadouts: ReturnType<typeof importLoadouts>,
    ) => void;
}) {
    const t = useTranslations("share.import");
    const tShare = useTranslations("share");
    const tGroups = useTranslations("groups");
    const tCommon = useTranslations("common");
    const showOrnaments = useSettings((s) => s.showOrnaments);

    const defOf = (hash: number) => defs.get(hash);
    const classType = shareClassType(snapshot, defOf);
    const characters = useMemo(
        () =>
            data.characters.filter(
                (character) =>
                    classType === undefined || character.classType === classType,
            ),
        [data.characters, classType],
    );

    const [target, setTarget] = useState<string | null>(
        () =>
            characters.find((character) => character.characterId === characterId)
                ?.characterId ??
            characters[0]?.characterId ??
            null,
    );
    const [name, setName] = useState(snapshot.name.slice(0, GROUP_NAME_MAX));
    const [busy, setBusy] = useState(false);

    /** Les objets du compte, chacun avec son détenteur. */
    const accountItems = useMemo<AccountItem[]>(() => {
        const out: AccountItem[] = [];
        for (const character of data.characters) {
            for (const item of [
                ...(data.equipment[character.characterId] ?? []),
                ...(data.inventory[character.characterId] ?? []),
            ]) {
                if (item.itemInstanceId) {
                    out.push({
                        itemHash: item.itemHash,
                        itemInstanceId: item.itemInstanceId,
                        characterId: character.characterId,
                    });
                }
            }
        }
        for (const item of data.vault) {
            if (item.itemInstanceId) {
                out.push({
                    itemHash: item.itemHash,
                    itemInstanceId: item.itemInstanceId,
                    characterId: null,
                });
            }
        }
        return out;
    }, [data]);

    /** Les composants du compte, pour les habillages des vignettes. */
    const components = useMemo(
        () =>
            new Map(
                [
                    ...Object.values(data.equipment),
                    ...Object.values(data.inventory),
                    data.vault,
                ]
                    .flat()
                    .flatMap((item) =>
                        item.itemInstanceId ? [[item.itemInstanceId, item] as const] : [],
                    ),
            ),
        [data],
    );

    const choices = useMemo(() => {
        if (!target) return [];
        const ctx: ImportContext = {
            items: accountItems,
            details: data.items,
            defOf: (hash) => defs.get(hash),
        };
        return importChoices(snapshot, target, classType, ctx).sort(
            (a, b) =>
                (BUCKET_RANK.get(a.shared.bucketHash) ?? 99) -
                (BUCKET_RANK.get(b.shared.bucketHash) ?? 99),
        );
    }, [snapshot, target, classType, accountItems, data.items, defs]);

    // Le choix proposé d'office suit le personnage : une doctrine, par
    // exemple, n'a pas les mêmes candidats d'un personnage à l'autre.
    const [picks, setPicks] = useState(() => defaultPicks(choices));
    const [picksFor, setPicksFor] = useState(target);
    if (picksFor !== target) {
        setPicksFor(target);
        setPicks(defaultPicks(choices));
    }

    const slotCount = target ? (data.loadouts?.[target]?.length ?? 0) : 0;
    const truncated = snapshot.loadouts
        .slice(slotCount)
        .some((loadout) => loadout.items.length > 0);
    const kept = choices.filter((choice) => choice.kept).length;
    const toPick = choices.filter((choice) => !choice.kept);

    /** Toutes les vignettes de la fenêtre, en une requête groupée. */
    const refs = useMemo<ItemRef[]>(
        () => [
            ...choices.map((choice) => ({itemHash: choice.shared.itemHash})),
            ...choices.flatMap((choice) =>
                choice.candidates.flatMap((id) => {
                    const item = components.get(id);
                    return item ? [{itemHash: item.itemHash, itemInstanceId: id}] : [];
                }),
            ),
        ],
        [choices, components],
    );

    const confirm = async () => {
        if (!target) return;
        setBusy(true);
        try {
            // Les attributs, maintenant seulement : ils ne servent qu'à
            // reporter les valeurs enregistrées, et leur famille dit lesquelles
            // ont un sens sur l'exemplaire retenu.
            const all = await withDefinitions(
                defs,
                importDefinitionHashes(snapshot, choices, data.items),
            );
            onConfirm(
                target,
                name,
                importLoadouts(snapshot, picks, slotCount, {
                    items: accountItems,
                    details: data.items,
                    defOf: (hash) => all.get(hash),
                }),
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <p className="share-import__message">
                {tShare("sharedBy", {user: author, name: snapshot.name})}
            </p>

            {characters.length === 0 ? (
                <p className="share-import__message share-import__message--error">
                    {t("noCharacter")}
                </p>
            ) : (
                <>
                    <span className="share-import__label">{t("characterLabel")}</span>
                    <CharacterPicker
                        characters={characters}
                        selectedId={target}
                        onSelect={setTarget}
                        full
                    />

                    <label className="share-import__label" htmlFor="share-import-name">
                        {tGroups("nameLabel")}
                    </label>
                    <input
                        id="share-import-name"
                        className="share-import__input"
                        value={name}
                        maxLength={GROUP_NAME_MAX}
                        onChange={(event) => setName(event.target.value)}
                    />

                    {slotCount === 0 && (
                        <p className="share-import__message share-import__message--error">
                            {tGroups("noSlots")}
                        </p>
                    )}
                    {truncated && (
                        <p className="share-import__message">{t("truncated")}</p>
                    )}
                    {kept > 0 && (
                        <p className="share-import__message">{t("kept", {count: kept})}</p>
                    )}

                    {toPick.length > 0 && (
                        <>
                            <span className="share-import__label">{t("itemsLabel")}</span>
                            <ItemDefsProvider
                                items={refs}
                                details={data.items}
                                withOrnaments={showOrnaments}
                            >
                                <ul className="share-import__choices">
                                    {toPick.map((choice) => (
                                        <ChoiceRow
                                            key={choice.shared.itemInstanceId}
                                            choice={choice}
                                            picked={picks.get(choice.shared.itemInstanceId) ?? null}
                                            components={components}
                                            data={data}
                                            onPick={(id) =>
                                                setPicks((current) =>
                                                    new Map(current).set(
                                                        choice.shared.itemInstanceId,
                                                        id,
                                                    ),
                                                )
                                            }
                                        />
                                    ))}
                                </ul>
                            </ItemDefsProvider>
                        </>
                    )}
                </>
            )}

            <div className="share-import__actions">
                <button type="button" className="btn btn--small" onClick={onCancel}>
                    {tCommon("cancel")}
                </button>
                <button
                    type="button"
                    className="btn btn--small btn--primary"
                    disabled={
                        busy || !target || slotCount === 0 || name.trim().length === 0
                    }
                    onClick={() => void confirm()}
                >
                    {tCommon("import")}
                </button>
            </div>
        </>
    );
}

/**
 * Un objet du partage, et les exemplaires du compte qui peuvent le remplacer.
 *
 * « Aucun » reste toujours proposé : laisser l'objet de côté vaut mieux qu'une
 * pièce dont on ne veut pas, l'équipement s'en passera.
 */
function ChoiceRow({
                       choice,
                       picked,
                       components,
                       data,
                       onPick,
                   }: {
    choice: ImportChoice;
    picked: string | null;
    components: ReadonlyMap<string, ProfileData["vault"][number]>;
    data: ProfileData;
    onPick: (itemInstanceId: string | null) => void;
}) {
    const t = useTranslations("share.import");

    return (
        <li className="share-import__choice">
            <SharedThumb item={choice.shared}/>
            <span className="share-import__arrow" aria-hidden>→</span>

            <div className="share-import__candidates">
                {choice.candidates.length === 0 && (
                    <span className="share-import__missing">{t("missing")}</span>
                )}
                {choice.candidates.map((id) => {
                    const item = components.get(id);
                    if (!item) return null;
                    return (
                        <CandidateButton
                            key={id}
                            itemHash={item.itemHash}
                            itemInstanceId={id}
                            state={item.state}
                            versionNumber={item.versionNumber}
                            gearTier={data.items[id]?.instance?.gearTier}
                            power={data.items[id]?.instance?.primaryStat?.value}
                            selected={picked === id}
                            onClick={() => onPick(id)}
                        />
                    );
                })}
                {choice.candidates.length > 0 && (
                    <button
                        type="button"
                        className={`share-import__none${
                            picked === null ? " share-import__none--selected" : ""
                        }`}
                        aria-pressed={picked === null}
                        onClick={() => onPick(null)}
                    >
                        {t("none")}
                    </button>
                )}
            </div>
        </li>
    );
}

/** L'objet de l'auteur, tel que le partage le décrit. */
function SharedThumb({item}: {item: SharedItem}) {
    const def = useSharedDefinition(item.itemHash);
    return (
        <span
            className="share-import__thumb"
            title={def?.displayProperties?.name}
        >
            <ItemThumb
                itemHash={item.itemHash}
                state={item.state}
                versionNumber={item.versionNumber}
            />
        </span>
    );
}

function CandidateButton({
                             itemHash,
                             itemInstanceId,
                             state,
                             versionNumber,
                             gearTier,
                             power,
                             selected,
                             onClick,
                         }: {
    itemHash: number;
    itemInstanceId: string;
    state?: number;
    versionNumber?: number;
    gearTier?: number;
    power?: number;
    selected: boolean;
    onClick: () => void;
}) {
    const def = useSharedDefinition(itemHash);
    const label = [def?.displayProperties?.name, power].filter(Boolean).join(" · ");
    return (
        <button
            type="button"
            className={`share-import__candidate${
                selected ? " share-import__candidate--selected" : ""
            }`}
            aria-pressed={selected}
            aria-label={label}
            title={label}
            onClick={onClick}
        >
            <span className="share-import__thumb">
                <ItemThumb
                    itemHash={itemHash}
                    itemInstanceId={itemInstanceId}
                    state={state}
                    versionNumber={versionNumber}
                    gearTier={gearTier}
                />
            </span>
            {power !== undefined && (
                <span className="share-import__power">{power}</span>
            )}
        </button>
    );
}
