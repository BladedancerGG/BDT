// Vérification du déplacement des **piles** dans `lib/destiny/moves.ts` — mods,
// consommables et matériaux, les objets que l'API ne sait pas nommer.
//
// Ce que ces cas protègent :
//
//  - un objet non instancié n'a pas d'`itemInstanceId` : il se désigne par un
//    identifiant de synthèse (`stackId`) qui porte son hash ET l'endroit où il
//    se trouve, faute de quoi une pile au coffre et une pile du même objet dans
//    le rangement partagé seraient confondues ;
//  - ces deux endroits arrivent dans le **même** composant (`profileInventory`,
//    ici `profile.vault`) : seul le `bucketHash` les sépare, et un transfert de
//    l'un à l'autre ne fait pas changer l'objet de tableau ;
//  - le rangement est de portée compte : le viser depuis un personnage ou un
//    autre ne déplace rien ;
//  - deux piles du même objet au même endroit n'existent pas — elles
//    fusionnent, et le rejeu local doit le refléter sous peine de planifier le
//    déplacement suivant contre un état faux.

import {
    applyStep,
    planMove,
    stackId,
    type MovePlan,
    type PlanContext,
    type PlannedStep,
} from "../../src/lib/destiny/moves";
import type { ProfileData } from "../../src/lib/bungie/use-profile";
import type { DestinyItemComponent } from "../../src/lib/bungie/profile";
import type { InventoryItemDefinition } from "../../src/lib/destiny/types";
import { BUCKET } from "../../src/lib/destiny/buckets";
import { check, report, section } from "./assert";

const MOD = 1234;
const CHAR = "char-1";

/** Une pile : ni instance, ni palier, juste un hash et une quantité. */
const stack = (
    bucketHash: number,
    quantity: number,
): DestinyItemComponent =>
    ({ itemHash: MOD, bucketHash, quantity, location: 0, state: 0 }) as
        DestinyItemComponent;

const modDef = {
    inventory: { bucketTypeHash: BUCKET.Modifications },
} as unknown as InventoryItemDefinition;

const context = (vault: DestinyItemComponent[], inventory: DestinyItemComponent[] = []): PlanContext => ({
    profile: {
        characters: [],
        equipment: {},
        inventory: { [CHAR]: inventory },
        vault,
        items: {},
    } satisfies ProfileData,
    defs: new Map([[MOD, modDef]]),
    // Les capacités du manifeste : 50 pour les modificateurs, 1300 au coffre.
    capacities: new Map([
        [BUCKET.Modifications, 50],
        [BUCKET.Vault, 1300],
    ]),
});

const atPouch = stackId(MOD, { kind: "inventory", characterId: CHAR });
const atVault = stackId(MOD, { kind: "vault" });

section("identifier une pile");

check("le coffre et le rangement ne portent pas le même identifiant",
    atPouch === atVault, false);
check("l'identifiant se relit",
    planMove(atVault, { kind: "vault" }, context([stack(BUCKET.Vault, 3)])),
    { ok: true, steps: [] });
check("une pile absente de l'endroit annoncé est un refus",
    planMove(atVault, { kind: "inventory", characterId: CHAR }, context([])),
    { ok: false, failure: "notInstanced" });

section("planifier");

const fromVault = planMove(
    atVault,
    { kind: "inventory", characterId: CHAR },
    context([stack(BUCKET.Vault, 3)]),
);
check("coffre → rangement : une seule requête, la pile entière",
    fromVault,
    {
        ok: true,
        steps: [{
            kind: "fromVault",
            role: "move",
            bucketHash: BUCKET.Modifications,
            characterId: CHAR,
            itemHash: MOD,
            itemInstanceId: atVault,
            stackSize: 3,
        }],
    });

check("rangement → coffre : l'inverse",
    planMove(atPouch, { kind: "vault" }, context([stack(BUCKET.Modifications, 2)])),
    {
        ok: true,
        steps: [{
            kind: "toVault",
            role: "move",
            bucketHash: BUCKET.Vault,
            characterId: CHAR,
            itemHash: MOD,
            itemInstanceId: atPouch,
            stackSize: 2,
        }],
    });

// Le rangement est commun aux personnages : rien à faire, et surtout pas un
// transfert qui ne déplacerait rien.
check("rangement → rangement d'un autre personnage : rien à faire",
    planMove(atPouch, { kind: "inventory", characterId: "char-2" },
        context([stack(BUCKET.Modifications, 2)])),
    { ok: true, steps: [] });

check("une pile ne s'équipe pas",
    planMove(atPouch, { kind: "equipped", characterId: CHAR },
        context([stack(BUCKET.Modifications, 2)])),
    { ok: false, failure: "notEquippable" });

section("les destinations pleines");

/** Cinquante piles distinctes : le rangement est plein. */
const fullPouch = Array.from({ length: 50 }, (_, i) =>
    ({ itemHash: 9000 + i, bucketHash: BUCKET.Modifications, quantity: 1, location: 0, state: 0 }) as
        DestinyItemComponent);

check("rangement plein : refus",
    planMove(atVault, { kind: "inventory", characterId: CHAR },
        context([stack(BUCKET.Vault, 1), ...fullPouch])),
    { ok: false, failure: "bucketFull" });

// Une pile qui en rejoint une du même objet fusionne : elle n'occupe aucune
// place neuve, et un rangement plein l'accepte quand même.
check("rangement plein, mais une pile du même mod y est déjà : accepté",
    planMove(atVault, { kind: "inventory", characterId: CHAR },
        context([
            stack(BUCKET.Vault, 1),
            ...fullPouch.slice(1),
            stack(BUCKET.Modifications, 4),
        ])).ok,
    true);

// La régression du jour : les capacités du rangement partagé manquaient à la
// liste que lit le planificateur, qui retombait sur celle d'une arme — dix — et
// refusait tout transfert vers un rangement qui en contient cinquante.
check("capacité inconnue : ne rien refuser",
    planMove(atVault, { kind: "inventory", characterId: CHAR }, {
        ...context([stack(BUCKET.Vault, 1), ...fullPouch]),
        capacities: new Map(),
    }).ok,
    true);

section("rejouer le déplacement sur le cache");

const step = (kind: PlannedStep["kind"], id: string, bucketHash: number): PlannedStep => ({
    kind,
    role: "move",
    bucketHash,
    characterId: CHAR,
    itemHash: MOD,
    itemInstanceId: id,
    stackSize: 3,
});

const moved = applyStep(
    context([stack(BUCKET.Vault, 3)]).profile,
    step("fromVault", atVault, BUCKET.Modifications),
);
check("la pile change d'emplacement sans changer de tableau",
    moved.vault.map((i) => [i.bucketHash, i.quantity]),
    [[BUCKET.Modifications, 3]]);

const mergedProfile = applyStep(
    context([stack(BUCKET.Vault, 3), stack(BUCKET.Modifications, 4)]).profile,
    step("fromVault", atVault, BUCKET.Modifications),
);
check("deux piles du même mod fusionnent",
    mergedProfile.vault.map((i) => [i.bucketHash, i.quantity]),
    [[BUCKET.Modifications, 7]]);

const pulled = applyStep(
    context([], [stack(BUCKET.Postmaster, 3)]).profile,
    step("pull", stackId(MOD, { kind: "postmaster", characterId: CHAR }),
        BUCKET.Modifications),
);
check("le retrait du Courrier fait bien changer de tableau",
    [pulled.inventory[CHAR].length, pulled.vault.map((i) => i.bucketHash)],
    [0, [BUCKET.Modifications]]);

section("n'en prendre qu'une part");

/** La taille de pile de la première étape d'un plan, ou `null` s'il a échoué. */
const firstStackSize = (plan: MovePlan) =>
    plan.ok ? (plan.steps[0]?.stackSize ?? null) : null;

// La quantité vient du sélecteur ouvert au dépôt : elle est portée par le plan,
// puis par chaque étape.
check("la quantité demandée passe dans l'étape",
    firstStackSize(planMove(atVault, { kind: "inventory", characterId: CHAR },
        context([stack(BUCKET.Vault, 10)]), 4)),
    4);
check("plus que la pile ne contient : ramené à la pile",
    firstStackSize(planMove(atVault, { kind: "inventory", characterId: CHAR },
        context([stack(BUCKET.Vault, 3)]), 99)),
    3);
check("zéro ou moins : au moins un exemplaire part",
    firstStackSize(planMove(atVault, { kind: "inventory", characterId: CHAR },
        context([stack(BUCKET.Vault, 3)]), 0)),
    1);

const split = applyStep(
    context([stack(BUCKET.Vault, 10)]).profile,
    { ...step("fromVault", atVault, BUCKET.Modifications), stackSize: 4 },
);
check("le reste demeure là où il était",
    split.vault.map((i) => [i.bucketHash, i.quantity]),
    [[BUCKET.Vault, 6], [BUCKET.Modifications, 4]]);

const splitMerged = applyStep(
    context([stack(BUCKET.Vault, 10), stack(BUCKET.Modifications, 1)]).profile,
    { ...step("fromVault", atVault, BUCKET.Modifications), stackSize: 4 },
);
check("la part transférée fusionne, le reste demeure",
    splitMerged.vault.map((i) => [i.bucketHash, i.quantity]),
    [[BUCKET.Vault, 6], [BUCKET.Modifications, 5]]);

section("amener un remplaçant d'ailleurs");

// L'API n'a pas de « déséquiper » : un personnage qui n'a rien d'autre de rangé
// dans l'emplacement ne pouvait pas se séparer de son arme. Il faut désormais
// lui amener un remplaçant — du coffre d'abord, sinon d'un autre personnage.

const GUN = 5000;
const SPARE = 5001;
const EXO = 5002;
const HUNTER_HELM = 5003;
const OTHER = "char-2";

const weapon = (id: string, itemHash: number, bucketHash: number): DestinyItemComponent =>
    ({ itemHash, itemInstanceId: id, bucketHash, quantity: 1, location: 0, state: 0 }) as
        DestinyItemComponent;
const weaponDef = (tierType: number) => ({
    inventory: { bucketTypeHash: BUCKET.KineticWeapons, tierType },
}) as unknown as InventoryItemDefinition;

const gearContext = (profile: Partial<ProfileData>): PlanContext => ({
    profile: {
        characters: [
            { characterId: CHAR, classType: 0 },
            { characterId: OTHER, classType: 1 },
        ] as ProfileData["characters"],
        equipment: { [CHAR]: [weapon("gun", GUN, BUCKET.KineticWeapons)] },
        inventory: { [CHAR]: [], [OTHER]: [] },
        vault: [],
        items: {},
        ...profile,
    },
    defs: new Map([
        [GUN, weaponDef(5)],
        [SPARE, weaponDef(5)],
        [EXO, weaponDef(6)],
        [HUNTER_HELM, {
            inventory: { bucketTypeHash: BUCKET.KineticWeapons, tierType: 5 },
            classType: 1,
        } as unknown as InventoryItemDefinition],
    ]),
    capacities: new Map([
        [BUCKET.KineticWeapons, 10],
        [BUCKET.Vault, 1300],
    ]),
});

const kinds = (plan: MovePlan) =>
    plan.ok ? plan.steps.map((s) => `${s.kind}:${s.role}:${s.itemInstanceId}`) : plan.failure;

check("rien nulle part : refus",
    kinds(planMove("gun", { kind: "vault" }, gearContext({}))),
    "noReplacement");

check("le coffre fournit le remplaçant",
    kinds(planMove("gun", { kind: "vault" }, gearContext({
        vault: [weapon("spare", SPARE, BUCKET.Vault)],
    }))),
    [
        "fromVault:standIn:spare",
        "equip:unequip:spare",
        "toVault:move:gun",
    ]);

check("coffre vide : un autre personnage prête ce qu'il a de rangé",
    kinds(planMove("gun", { kind: "vault" }, gearContext({
        inventory: { [CHAR]: [], [OTHER]: [weapon("spare", SPARE, BUCKET.KineticWeapons)] },
    }))),
    [
        "toVault:standIn:spare",
        "fromVault:standIn:spare",
        "equip:unequip:spare",
        "toVault:move:gun",
    ]);

check("un objet équipé ailleurs n'est jamais pris",
    kinds(planMove("gun", { kind: "vault" }, gearContext({
        equipment: {
            [CHAR]: [weapon("gun", GUN, BUCKET.KineticWeapons)],
            [OTHER]: [weapon("spare", SPARE, BUCKET.KineticWeapons)],
        },
    }))),
    "noReplacement");

check("le non-exotique passe avant l'exotique",
    kinds(planMove("gun", { kind: "vault" }, gearContext({
        vault: [weapon("exo", EXO, BUCKET.Vault), weapon("spare", SPARE, BUCKET.Vault)],
    }))).slice(0, 1),
    ["fromVault:standIn:spare"]);

check("une armure d'une autre classe n'est pas un remplaçant",
    kinds(planMove("gun", { kind: "vault" }, gearContext({
        vault: [weapon("helm", HUNTER_HELM, BUCKET.Vault)],
    }))),
    "noReplacement");

// Vers un autre personnage : le remplaçant pris au coffre ne doit pas fausser
// le compte de celui-ci pour le transfert qui suit.
check("vers un autre personnage : remplaçant, puis le trajet habituel",
    kinds(planMove("gun", { kind: "equipped", characterId: OTHER }, gearContext({
        characters: [
            { characterId: CHAR, classType: 0 },
            { characterId: OTHER, classType: 0 },
        ] as ProfileData["characters"],
        vault: [weapon("spare", SPARE, BUCKET.Vault)],
    }))),
    [
        "fromVault:standIn:spare",
        "equip:unequip:spare",
        "toVault:move:gun",
        "fromVault:move:gun",
        "equip:move:gun",
    ]);

// Le rejeu local enchaîne les trois étapes sans perdre l'objet libéré
{
    const ctx = gearContext({ vault: [weapon("spare", SPARE, BUCKET.Vault)] });
    const plan = planMove("gun", { kind: "vault" }, ctx);
    const after = plan.ok
        ? plan.steps.reduce((profile, s) => applyStep(profile, s), ctx.profile)
        : ctx.profile;
    check("rejeu : le remplaçant est porté, l'objet libéré dort au coffre",
        [
            after.equipment[CHAR].map((i) => i.itemInstanceId),
            after.inventory[CHAR].length,
            after.vault.map((i) => i.itemInstanceId),
        ],
        [["spare"], 0, ["gun"]]);
}

section("libérer un exotique concurrent");

// Le jeu n'accepte qu'une arme exotique équipée. En équiper une dans un AUTRE
// emplacement demande de chasser la première par un non exotique — et un
// inventaire vidé, où seuls les objets portés restent, n'en avait aucun sous
// la main : le refus « noExoticSwap » tombait alors qu'il y en avait au coffre.

const ENERGY_EXO = 5004;
const exoticContext = (profile: Partial<ProfileData>): PlanContext => {
    const base = gearContext(profile);
    return {
        ...base,
        profile: {
            ...base.profile,
            // L'exotique porté est l'arme cinétique ; on vise l'énergétique.
            equipment: {
                [CHAR]: [
                    weapon("exo", EXO, BUCKET.KineticWeapons),
                    weapon("gun2", GUN, BUCKET.EnergyWeapons),
                ],
            },
            ...profile,
        },
        defs: new Map([
            ...base.defs,
            [ENERGY_EXO, {
                inventory: { bucketTypeHash: BUCKET.EnergyWeapons, tierType: 6 },
            } as unknown as InventoryItemDefinition],
        ]),
        capacities: new Map([
            ...base.capacities,
            [BUCKET.EnergyWeapons, 10],
        ]),
    };
};
const equipEnergyExo = (profile: Partial<ProfileData>) =>
    kinds(planMove("eexo", { kind: "equipped", characterId: CHAR }, exoticContext(profile)));

check("un non exotique rangé sur le personnage suffit, comme avant",
    equipEnergyExo({
        inventory: {
            [CHAR]: [
                weapon("spare", SPARE, BUCKET.KineticWeapons),
                weapon("eexo", ENERGY_EXO, BUCKET.EnergyWeapons),
            ],
            [OTHER]: [],
        },
    }),
    ["equip:unequip:spare", "equip:move:eexo"]);

check("inventaire vide : le coffre fournit le non exotique",
    equipEnergyExo({
        inventory: { [CHAR]: [weapon("eexo", ENERGY_EXO, BUCKET.EnergyWeapons)], [OTHER]: [] },
        vault: [weapon("spare", SPARE, BUCKET.Vault)],
    }),
    ["fromVault:standIn:spare", "equip:unequip:spare", "equip:move:eexo"]);

check("le remplaçant du coffre ne peut pas être un exotique",
    equipEnergyExo({
        inventory: { [CHAR]: [weapon("eexo", ENERGY_EXO, BUCKET.EnergyWeapons)], [OTHER]: [] },
        vault: [weapon("exo2", EXO, BUCKET.Vault)],
    }),
    "noExoticSwap");

check("coffre vide : un autre personnage prête son non exotique",
    equipEnergyExo({
        characters: [
            { characterId: CHAR, classType: 0 },
            { characterId: OTHER, classType: 0 },
        ] as ProfileData["characters"],
        inventory: {
            [CHAR]: [weapon("eexo", ENERGY_EXO, BUCKET.EnergyWeapons)],
            [OTHER]: [weapon("spare", SPARE, BUCKET.KineticWeapons)],
        },
    }),
    [
        "toVault:standIn:spare",
        "fromVault:standIn:spare",
        "equip:unequip:spare",
        "equip:move:eexo",
    ]);

// L'exotique visé est au coffre : il arrive d'abord, puis le remplaçant. Les
// deux sorties du coffre ne doivent pas se gêner.
check("l'exotique et son remplaçant viennent tous deux du coffre",
    equipEnergyExo({
        inventory: { [CHAR]: [], [OTHER]: [] },
        vault: [
            weapon("eexo", ENERGY_EXO, BUCKET.Vault),
            weapon("spare", SPARE, BUCKET.Vault),
        ],
    }),
    [
        "fromVault:move:eexo",
        "fromVault:standIn:spare",
        "equip:unequip:spare",
        "equip:move:eexo",
    ]);

{
    const ctx = exoticContext({
        inventory: { [CHAR]: [weapon("eexo", ENERGY_EXO, BUCKET.EnergyWeapons)], [OTHER]: [] },
        vault: [weapon("spare", SPARE, BUCKET.Vault)],
    });
    const plan = planMove("eexo", { kind: "equipped", characterId: CHAR }, ctx);
    const after = plan.ok
        ? plan.steps.reduce((profile, s) => applyStep(profile, s), ctx.profile)
        : ctx.profile;
    check("rejeu : le remplaçant tient l'emplacement cinétique, l'exotique est rangé",
        [
            after.equipment[CHAR].map((i) => i.itemInstanceId).sort(),
            after.inventory[CHAR].map((i) => i.itemInstanceId).sort(),
        ],
        [["eexo", "spare"], ["exo", "gun2"]]);
}

process.exit(report());
