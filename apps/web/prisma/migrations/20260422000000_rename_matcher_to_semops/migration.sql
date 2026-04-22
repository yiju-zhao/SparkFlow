-- Rename UserSettings matcherModel* columns to semopsModel*.
-- Hand-crafted to use RENAME COLUMN so existing rows keep their values
-- (Prisma's default is DROP + ADD which would lose data).

ALTER TABLE "UserSettings" RENAME COLUMN "matcherModelProvider" TO "semopsModelProvider";
ALTER TABLE "UserSettings" RENAME COLUMN "matcherModelName" TO "semopsModelName";
