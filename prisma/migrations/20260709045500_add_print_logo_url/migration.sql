-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "printLogoUrl" TEXT;

-- Chix's app logo is a white wordmark (for the dark theme) — invisible on a
-- white sticker sheet, so print materials get a navy version instead.
UPDATE "Location" SET "printLogoUrl" = '/brand/chix-logo-print.png' WHERE "slug" = 'chix';
