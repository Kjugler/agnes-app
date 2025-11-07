/**
 * Generates a unique referral/discount code.
 * Format: FOUR letters from name (or "JODY"), hyphen, 4-char base36 random, uppercase
 * Example: JODY-8G2K
 */
export function generateCode(name: string): string {
  // Extract first 4 letters from name, uppercase, or use "JODY" as fallback
  const namePart = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4) || 'JODY';
  const prefix = namePart.length >= 4 ? namePart : namePart.padEnd(4, 'X');

  // Generate 4-character random base36 string (0-9, A-Z)
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();

  return `${prefix}-${randomPart}`;
}
