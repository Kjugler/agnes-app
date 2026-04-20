-- Parity with deepquill: beta archive flags on Purchase / Order.

ALTER TABLE "Purchase" ADD COLUMN "saleStatus" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "Purchase" ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Purchase" ADD COLUMN "countsForShipping" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Purchase" ADD COLUMN "countsForPoints" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Order" ADD COLUMN "saleStatus" TEXT NOT NULL DEFAULT 'live';
ALTER TABLE "Order" ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Order" ADD COLUMN "countsForShipping" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Order" ADD COLUMN "countsForPoints" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "Purchase_saleStatus_idx" ON "Purchase"("saleStatus");
CREATE INDEX "Order_saleStatus_idx" ON "Order"("saleStatus");
