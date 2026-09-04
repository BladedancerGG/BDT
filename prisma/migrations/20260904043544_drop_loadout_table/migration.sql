/*
  Warnings:

  - You are about to drop the `Loadout` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Loadout" DROP CONSTRAINT "Loadout_userId_fkey";

-- DropTable
DROP TABLE "Loadout";
