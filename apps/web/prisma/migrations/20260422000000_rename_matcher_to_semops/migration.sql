-- Rename UserSettings matcherModel* columns to semopsModel*.
-- Hand-crafted to use RENAME COLUMN so existing rows keep their values
-- (Prisma's default is DROP + ADD which would lose data).
-- Table is mapped via @@map("user_settings") in the Prisma schema.

ALTER TABLE "user_settings" RENAME COLUMN "matcherModelProvider" TO "semopsModelProvider";
ALTER TABLE "user_settings" RENAME COLUMN "matcherModelName" TO "semopsModelName";
