-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "bungieMembershipId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loadout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorHash" INTEGER,
    "iconHash" INTEGER,
    "characterId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loadout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_bungieMembershipId_key" ON "User"("bungieMembershipId");

-- CreateIndex
CREATE INDEX "Loadout_userId_idx" ON "Loadout"("userId");

-- AddForeignKey
ALTER TABLE "Loadout" ADD CONSTRAINT "Loadout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
