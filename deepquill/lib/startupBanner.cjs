// deepquill/lib/startupBanner.cjs
// Startup banner for DeepQuill API - observability and version tracking

const { execSync } = require('child_process');
const path = require('path');

/**
 * Get git SHA safely (first 7 chars)
 * Priority: process.env.GIT_SHA > git rev-parse --short HEAD > 'unknown'
 */
function getGitSha() {
  // Check environment variable first
  if (process.env.GIT_SHA) {
    return process.env.GIT_SHA.substring(0, 7);
  }
  
  // Try to get from git command
  try {
    const gitRoot = path.resolve(__dirname, '..');
    const sha = execSync('git rev-parse --short HEAD', {
      cwd: gitRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000, // 2 second timeout
    }).trim();
    return sha.substring(0, 7);
  } catch (err) {
    // Git unavailable or not a git repo - return unknown
    return 'unknown';
  }
}

/**
 * Check if legacy points migration is enabled
 * Based on actual code behavior - checks if the migration logic exists in the codebase
 */
function isLegacyPointsImportEnabled() {
  try {
    const scorePath = path.resolve(__dirname, '../api/contest/score.cjs');
    const fs = require('fs');
    if (!fs.existsSync(scorePath)) {
      return false;
    }
    const scoreCode = fs.readFileSync(scorePath, 'utf8');
    // Check if legacy migration code exists (look for the actual implementation)
    const hasLegacyCheck = scoreCode.includes('LEGACY_POINTS_IMPORT');
    const hasDeltaCheck = scoreCode.includes('delta > 0') && scoreCode.includes('delta <= 1000');
    const hasMigration = scoreCode.includes('recordLedgerEntry') && scoreCode.includes('MANUAL_ADJUST');
    return hasLegacyCheck && hasDeltaCheck && hasMigration;
  } catch (err) {
    // If we can't check, assume enabled (safer default - features are always on)
    return true;
  }
}

/**
 * Check if auto-reconciliation is enabled
 * Based on actual code behavior - checks if the reconciliation logic exists
 */
function isAutoReconciliationEnabled() {
  try {
    const scorePath = path.resolve(__dirname, '../api/contest/score.cjs');
    const fs = require('fs');
    if (!fs.existsSync(scorePath)) {
      return false;
    }
    const scoreCode = fs.readFileSync(scorePath, 'utf8');
    // Check if reconciliation code exists (look for the actual implementation)
    const hasReconciliationFlag = scoreCode.includes('reconciliationApplied');
    const hasUserUpdate = scoreCode.includes('prisma.user.update') && scoreCode.includes('points:');
    const hasMismatchCheck = scoreCode.includes('totalPoints !== player.points') || scoreCode.includes('calculatedTotalPoints !== user.points');
    return hasReconciliationFlag && hasUserUpdate && hasMismatchCheck;
  } catch (err) {
    // If we can't check, assume enabled (safer default - features are always on)
    return true;
  }
}

/**
 * Print startup banner
 * @param {Object} options - { port, nodeEnv }
 */
function printStartupBanner({ port, nodeEnv }) {
  const gitSha = getGitSha();
  const timestamp = new Date().toISOString();
  const legacyEnabled = isLegacyPointsImportEnabled();
  const reconciliationEnabled = isAutoReconciliationEnabled();
  
  const banner = `
────────────────────────────────────────
🚀 DeepQuill API starting
Environment: ${nodeEnv || 'unknown'}
Port: ${port || 'unknown'}
Git SHA: ${gitSha}
Started at: ${timestamp}

Features:
- LEGACY_POINTS_IMPORT: ${legacyEnabled ? 'ENABLED' : 'DISABLED'}
- AUTO_RECONCILIATION: ${reconciliationEnabled ? 'ENABLED' : 'DISABLED'}
────────────────────────────────────────
`.trim();
  
  console.log(banner);
}

module.exports = {
  printStartupBanner,
  getGitSha,
  isLegacyPointsImportEnabled,
  isAutoReconciliationEnabled,
};
