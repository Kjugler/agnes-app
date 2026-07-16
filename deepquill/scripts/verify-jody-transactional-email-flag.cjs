/**
 * Ensures Jody email paths use TRANSACTIONAL_EMAIL_ENABLED=1 (not literal 'true').
 * Run: node scripts/verify-jody-transactional-email-flag.cjs
 */
const fs = require('fs');
const path = require('path');

const jodyApiDir = path.join(__dirname, '..', 'api', 'jody');
const files = fs.readdirSync(jodyApiDir).filter((f) => f.endsWith('.cjs'));

let failed = false;
for (const file of files) {
  const content = fs.readFileSync(path.join(jodyApiDir, file), 'utf8');
  if (/TRANSACTIONAL_EMAIL_ENABLED\s*===\s*['"]true['"]/.test(content)) {
    console.error('[FAIL]', file, 'still checks TRANSACTIONAL_EMAIL_ENABLED === "true"');
    failed = true;
  }
}

const rememberRequest = fs.readFileSync(path.join(jodyApiDir, 'rememberRequest.cjs'), 'utf8');
if (!rememberRequest.includes("TRANSACTIONAL_EMAIL_ENABLED === '1'")) {
  console.error('[FAIL] rememberRequest.cjs must check TRANSACTIONAL_EMAIL_ENABLED === \'1\'');
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log('[OK] Jody API email flag uses TRANSACTIONAL_EMAIL_ENABLED=1 convention');
