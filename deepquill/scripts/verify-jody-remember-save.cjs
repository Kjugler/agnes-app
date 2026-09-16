/**
 * Known-reader remember-save: header identity only, no verification email.
 * Run: node scripts/verify-jody-remember-save.cjs
 */
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const saveSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'jody', 'rememberSave.cjs'), 'utf8');
const requestSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'jody', 'rememberRequest.cjs'), 'utf8');
const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8');

assert.match(saveSrc, /x-jody-identity-user-id/);
assert.match(saveSrc, /user_id_not_accepted/);
assert.match(saveSrc, /saveJodyReadingProgress/);
assert.doesNotMatch(saveSrc, /sendEmail/);
assert.doesNotMatch(saveSrc, /buildRememberPlaceEmail/);
assert.doesNotMatch(saveSrc, /req\.body\.userId/);
assert.doesNotMatch(saveSrc, /ap_funnel_uid/);
assert.doesNotMatch(saveSrc, /prospectNurture/);

assert.match(requestSrc, /buildRememberPlaceEmail/);
assert.match(indexSrc, /\/api\/jody\/remember\/save/);

console.log('[OK] jody remember-save uses cookie identity and does not send email');
