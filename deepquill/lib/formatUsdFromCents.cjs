// deepquill/lib/formatUsdFromCents.cjs
// D1: Helper to format cents as USD dollars (ensures correct conversion)

/**
 * Format cents as USD dollars
 * D1: Ensures cents are correctly converted (divide by 100 once)
 * @param {number} cents - Amount in cents (e.g., 200 = $2.00)
 * @returns {string} Formatted USD string (e.g., "$2.00")
 */
function formatUsdFromCents(cents) {
  if (typeof cents !== 'number' || isNaN(cents)) {
    return '$0.00';
  }
  // D1: Divide by 100 once to convert cents to dollars
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

module.exports = { formatUsdFromCents };
