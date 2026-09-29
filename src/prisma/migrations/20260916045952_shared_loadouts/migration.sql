-- CreateTable
CREATE TABLE "SharedLoadout" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedLoadout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedLoadout_userId_idx" ON "SharedLoadout"("userId");

-- AddForeignKey
ALTER TABLE "SharedLoadout" ADD CONSTRAINT "SharedLoadout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
