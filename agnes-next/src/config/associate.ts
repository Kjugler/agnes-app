// agnes-next/src/config/associate.ts

/**
 * Associate Publisher Commission Constants
 * 
 * These values define how much associates earn and how much their friends save
 * when a purchase is made using an associate's referral code.
 */

export const BOOK_RETAIL_PRICE_CENTS = 2600; // $26.00 list price outside a sale window
export const FRIEND_DISCOUNT_CENTS = 390; // 15% of the $26 list price; live savings follow the dated paperback offer
export const ASSOCIATE_EARNING_CENTS = 200; // $2.00 flat earning per referred sale

// Legacy constants (kept for backward compatibility)
export const ASSOCIATE_COMMISSION_CENTS = ASSOCIATE_EARNING_CENTS; // Alias for backward compatibility

