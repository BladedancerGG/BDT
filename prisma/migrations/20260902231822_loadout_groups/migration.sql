-- CreateTable
CREATE TABLE "UserLoadoutGroups" (
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLoadoutGroups_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserLoadoutGroups" ADD CONSTRAINT "UserLoadoutGroups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
