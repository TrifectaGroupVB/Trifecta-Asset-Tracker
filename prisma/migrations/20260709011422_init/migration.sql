-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "installDate" TIMESTAMP(3),
    "photoUrl" TEXT,
    "warrantyExpires" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecField" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SpecField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualFile" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,

    CONSTRAINT "ManualFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "photoUrl" TEXT,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tech" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "Tech_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" INTEGER NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photoUrl" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "techId" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL,
    "serviceRequestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "serviceRequestId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "techName" TEXT NOT NULL,
    "workPerformed" TEXT NOT NULL,
    "partsUsed" TEXT,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartOrderLine" (
    "id" TEXT NOT NULL,
    "partOrderId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "PartOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "equipmentId" TEXT,
    "label" TEXT,
    "batchId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3),
    "voided" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL,

    CONSTRAINT "TagBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SpecField_equipmentId_idx" ON "SpecField"("equipmentId");

-- CreateIndex
CREATE INDEX "ManualFile_equipmentId_idx" ON "ManualFile"("equipmentId");

-- CreateIndex
CREATE INDEX "Part_equipmentId_idx" ON "Part"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_requestNumber_key" ON "ServiceRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "ServiceRequest_equipmentId_idx" ON "ServiceRequest"("equipmentId");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- CreateIndex
CREATE INDEX "RequestEvent_serviceRequestId_idx" ON "RequestEvent"("serviceRequestId");

-- CreateIndex
CREATE INDEX "ServiceRecord_equipmentId_idx" ON "ServiceRecord"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PartOrder_orderNumber_key" ON "PartOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "PartOrderLine_partOrderId_idx" ON "PartOrderLine"("partOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_code_key" ON "Tag"("code");

-- CreateIndex
CREATE INDEX "Tag_batchId_idx" ON "Tag"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "TagBatch_batchNumber_key" ON "TagBatch"("batchNumber");

-- AddForeignKey
ALTER TABLE "SpecField" ADD CONSTRAINT "SpecField_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualFile" ADD CONSTRAINT "ManualFile_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_techId_fkey" FOREIGN KEY ("techId") REFERENCES "Tech"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartOrder" ADD CONSTRAINT "PartOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartOrderLine" ADD CONSTRAINT "PartOrderLine_partOrderId_fkey" FOREIGN KEY ("partOrderId") REFERENCES "PartOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartOrderLine" ADD CONSTRAINT "PartOrderLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TagBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
