-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- Seed the three locations. Waterman's carries forward the existing
-- restaurantName/restaurantAddress Setting values; Chix and Shack are new.
INSERT INTO "Location" ("id", "slug", "name", "address", "logoUrl") VALUES
  ('loc_watermans', 'watermans', 'Waterman''s Surfside Grille', '415 Atlantic Ave, Virginia Beach, VA 23451', '/brand/watermans-logo-full.png'),
  ('loc_chix', 'chix', 'Chix on the Beach', '701 Atlantic Ave, Virginia Beach, VA 23451', '/brand/chix-logo-full.png'),
  ('loc_shack', 'shack', 'The Shack on 8th', '715 Atlantic Ave, Virginia Beach, VA 23451', '/brand/shack-logo-full.png');

-- AlterTable: add nullable first so existing rows don't violate NOT NULL
ALTER TABLE "Equipment" ADD COLUMN "restaurantId" TEXT;
ALTER TABLE "TagBatch" ADD COLUMN "restaurantId" TEXT;

-- Backfill: every existing row predates multi-location and belongs to Waterman's
UPDATE "Equipment" SET "restaurantId" = 'loc_watermans' WHERE "restaurantId" IS NULL;
UPDATE "TagBatch" SET "restaurantId" = 'loc_watermans' WHERE "restaurantId" IS NULL;

-- Now safe to enforce NOT NULL
ALTER TABLE "Equipment" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "TagBatch" ALTER COLUMN "restaurantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Equipment_restaurantId_idx" ON "Equipment"("restaurantId");

-- CreateIndex
CREATE INDEX "TagBatch_restaurantId_idx" ON "TagBatch"("restaurantId");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagBatch" ADD CONSTRAINT "TagBatch_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The old single-restaurant settings are superseded by the Location rows above.
DELETE FROM "Setting" WHERE "key" IN ('restaurantName', 'restaurantAddress');
