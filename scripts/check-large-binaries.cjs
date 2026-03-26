#!/usr/bin/env node
/**
 * Guard against accidentally committing oversized binaries.
 *
 * Default threshold: 25 MB
 * Override:
 *   MAX_BINARY_MB=40 node scripts/check-large-binaries.cjs
 *
 * Modes:
 *   LARGE_BINARY_MODE=fail (default) => exit 1 on offenders
 *   LARGE_BINARY_MODE=warn           => exit 0, warning only
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = process.cwd();
const thresholdMb = Number(process.env.MAX_BINARY_MB || '25');
const thresholdBytes = Math.floor(thresholdMb * 1024 * 1024);
const mode = (process.env.LARGE_BINARY_MODE || 'fail').toLowerCase();

function run(cmd) {
  try {
    return execSync(cmd, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString('utf8')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

const staged = run('git diff --cached --name-only --diff-filter=AM');
const untracked = run('git ls-files --others --exclude-standard');
const candidates = Array.from(new Set([...staged, ...untracked]));

const offenders = [];
for (const rel of candidates) {
  const abs = path.resolve(repoRoot, rel);
  if (!fs.existsSync(abs)) continue;
  const stat = fs.statSync(abs);
  if (!stat.isFile()) continue;
  if (stat.size > thresholdBytes) {
    offenders.push({
      file: toPosix(rel),
      bytes: stat.size,
      mb: (stat.size / (1024 * 1024)).toFixed(2),
    });
  }
}

if (offenders.length === 0) {
  console.log(`[large-binary-guard] OK: no staged/untracked files above ${thresholdMb} MB.`);
  process.exit(0);
}

console.log(
  `[large-binary-guard] Found ${offenders.length} staged/untracked file(s) above ${thresholdMb} MB:`
);
for (const o of offenders) {
  console.log(` - ${o.file} (${o.mb} MB)`);
}

if (mode === 'warn') {
  console.log('[large-binary-guard] WARN mode enabled; not failing.');
  process.exit(0);
}

console.error('[large-binary-guard] FAIL: reduce file size, move asset to external storage, or unstage.');
process.exit(1);

