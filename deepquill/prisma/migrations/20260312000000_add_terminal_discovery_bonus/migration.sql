-- Add terminalDiscoveryAwarded to User (SPEC 3: prevent duplicate terminal discovery bonus)
ALTER TABLE "User" ADD COLUMN "terminalDiscoveryAwarded" BOOLEAN NOT NULL DEFAULT false;
