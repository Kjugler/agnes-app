-- Migration: Add referral rewards support
-- Run this migration to add referral_earnings_cents and ReferralConversion table

-- Add referral_earnings_cents column to User table
ALTER TABLE User ADD COLUMN referralEarningsCents INTEGER NOT NULL DEFAULT 0;

-- Create ReferralConversion table
CREATE TABLE ReferralConversion (
  id TEXT PRIMARY KEY,
  referrerUserId TEXT NOT NULL,
  referralCode TEXT NOT NULL,
  buyerEmail TEXT,
  stripeSessionId TEXT NOT NULL UNIQUE,
  commissionCents INTEGER NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrerUserId) REFERENCES User(id)
);

-- Create indexes for performance
CREATE INDEX idx_referral_conversions_referrer_user_id_created_at ON ReferralConversion(referrerUserId, createdAt);
CREATE INDEX idx_referral_conversions_referral_code ON ReferralConversion(referralCode);

