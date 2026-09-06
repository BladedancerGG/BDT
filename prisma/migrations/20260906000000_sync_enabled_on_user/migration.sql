-- Déplace le drapeau de synchronisation de UserSettings vers User.
--
-- Le défaut est `true` : tout nouveau compte synchronise. Les comptes
-- existants, eux, gardent ce qu'ils avaient — et l'absence de ligne
-- UserSettings valait « synchronisation coupée » sous l'ancienne sémantique,
-- d'où le COALESCE à `false` : le défaut ne doit pas rallumer la
-- synchronisation chez quelqu'un qui ne l'a jamais demandée.
ALTER TABLE "User" ADD COLUMN "syncEnabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "User" u
SET "syncEnabled" = COALESCE(
    (SELECT s."enabled" FROM "UserSettings" s WHERE s."userId" = u."id"),
    false
);

ALTER TABLE "UserSettings" DROP COLUMN "enabled";
