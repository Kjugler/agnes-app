// agnes-next/src/config/associate.ts

/**
 * Associate Publisher Commission Constants
 * 
 * These values define how much associates earn and how much their friends save
 * when a purchase is made using an associate's referral code.
 */

export const BOOK_RETAIL_PRICE_CENTS = 2600; // $26.00 base retail price
export const FRIEND_DISCOUNT_CENTS = 390; // $3.90 discount for friend (15% off)
export const ASSOCIATE_EARNING_CENTS = 200; // $2.00 flat earning per referred sale

// Legacy constants (kept for backward compatibility)
export const ASSOCIATE_COMMISSION_CENTS = ASSOCIATE_EARNING_CENTS; // Alias for backward compatibility

