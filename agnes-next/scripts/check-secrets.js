#!/usr/bin/env node
/**
 * Prebuild script: Fail build if secrets (sk_ or whsec_) are found in agnes-next
 * This prevents accidentally committing Stripe/Mailchimp secrets
 */

const fs = require('fs');
const path = require('path');

const SECRET_PATTERNS = [
  /sk_test_[a-zA-Z0-9]{24,}/,
  /sk_live_[a-zA-Z0-9]{24,}/,
  /whsec_[a-zA-Z0-9]{24,}/,
];

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.next/,
  /\.git/,
  /dist/,
  /build/,
  /coverage/,
  /\.env/,
  /\.env\.local/,
  /\.env\.example/,
  /STRIPE_WEBHOOK_SETUP\.md/,
  /STRIPE_WEBHOOK_IMPLEMENTATION\.md/,
];

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(pattern => pattern.test(filePath));
}

function scanDirectory(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(process.cwd(), fullPath);

    if (shouldIgnore(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath, results);
    } else if (entry.isFile()) {
      // Only check text files (skip binaries)
      const ext = path.extname(entry.name).toLowerCase();
      const textExts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.env'];
      
      if (textExts.includes(ext) || entry.name.startsWith('.env')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          
          for (const pattern of SECRET_PATTERNS) {
            const matches = content.match(pattern);
            if (matches) {
              results.push({
                file: relativePath,
                match: matches[0].substring(0, 20) + '...',
                pattern: pattern.toString(),
              });
            }
          }
        } catch (err) {
          // Skip files that can't be read as text
        }
      }
    }
  }

  return results;
}

const rootDir = process.cwd();
const results = scanDirectory(rootDir);

if (results.length > 0) {
  console.error('\n❌ SECRET DETECTION FAILED: Found potential secrets in codebase!\n');
  console.error('Files containing secrets:');
  results.forEach(({ file, match }) => {
    console.error(`  - ${file} (found: ${match})`);
  });
  console.error('\n⚠️  Remove all Stripe/Mailchimp secrets from agnes-next.');
  console.error('   Secrets should only exist in deepquill/.env\n');
  process.exit(1);
}

console.log('✅ No secrets detected in agnes-next');
process.exit(0);

