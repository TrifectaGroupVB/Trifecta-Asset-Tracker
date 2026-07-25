-- Add soft-decommission timestamp to Equipment. Null = active (in service);
-- a set timestamp means the unit is retired (hidden from the public index,
-- badged in admin, its tags voided). History is preserved either way.
ALTER TABLE "Equipment" ADD COLUMN "decommissionedAt" TIMESTAMP(3);
