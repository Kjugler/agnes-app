#!/usr/bin/env node
/**
 * Local checks for Reader Manager edit-form source options and save-error placement.
 * Does not touch production data or deepquill/dev.db.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGNES_NEXT_ROOT = path.resolve(SCRIPT_DIR, '..');
const MODEL_TS = path.join(AGNES_NEXT_ROOT, 'src', 'config', 'readerSources.ts');
const DETAIL_CLIENT = path.join(
  AGNES_NEXT_ROOT,
  'src',
  'app',
  'admin',
  'readers',
  '[id]',
  'ReaderDetailClient.tsx',
);
const ADD_CLIENT = path.join(AGNES_NEXT_ROOT, 'src', 'app', 'admin', 'readers', 'ReadersAdminClient.tsx');

let passed = 0;
let failed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok  ${name}`);
    })
    .catch((err) => {
      failed += 1;
      process.stderr.write(`FAIL ${name}: ${err && err.message ? err.message : err}\n`);
    });
}

function transpileModel() {
  const require = createRequire(path.join(AGNES_NEXT_ROOT, 'package.json'));
  const ts = require('typescript');
  const source = fs.readFileSync(MODEL_TS, 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'readerSources.ts',
    reportDiagnostics: true,
  });
  if (diagnostics && diagnostics.length) {
    throw new Error(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  }
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-rm-edit-src-'));
  const outFile = path.join(outDir, 'readerSources.mjs');
  fs.writeFileSync(outFile, outputText);
  return { outDir, outFile };
}

async function main() {
  const { outDir, outFile } = transpileModel();
  const mod = await import(pathToFileURL(outFile).href);

  await check('historical sources appear in edit select options and stay exact', () => {
    const jody = mod.readerSourceSelectOptions('Jody Concierge');
    assert.equal(jody[0], 'Jody Concierge');
    assert.equal(jody.includes('Website'), true);
    assert.equal(jody.filter((s) => s === 'Jody Concierge').length, 1);

    const agree = mod.readerSourceSelectOptions('readers-agree-v2');
    assert.equal(agree[0], 'readers-agree-v2');
    assert.equal(agree.includes('Amazon'), true);

    const website = mod.readerSourceSelectOptions('Website');
    assert.equal(website.includes('Website'), true);
    assert.equal(website[0] === 'Website' || website.includes('Website'), true);
    assert.equal(website.includes('Jody Concierge'), false);
    assert.equal(website.includes('readers-agree-v2'), false);
    assert.deepEqual(website, [...mod.READER_SOURCES]);
  });

  await check('edit form uses helper and Add Reader does not', () => {
    const detail = fs.readFileSync(DETAIL_CLIENT, 'utf8');
    const add = fs.readFileSync(ADD_CLIENT, 'utf8');
    assert.match(detail, /readerSourceSelectOptions\(form\.source\)/);
    assert.doesNotMatch(detail, /READER_SOURCES\.map/);
    assert.match(add, /READER_SOURCES\.map/);
    assert.doesNotMatch(add, /readerSourceSelectOptions/);
  });

  await check('save failures render beside the Save control', () => {
    const detail = fs.readFileSync(DETAIL_CLIENT, 'utf8');
    const saveIdx = detail.indexOf("{saving ? 'Saving…' : 'Save'}");
    const alertIdx = detail.indexOf('role="alert"');
    const bottomFail = detail.search(/saveMessage && \(\s*<p style=\{\{ margin: 0, fontSize: 13, color: '#b91c1c' \}\}/);
    assert.ok(saveIdx > 0, 'Save button missing');
    assert.ok(alertIdx > saveIdx, 'save alert should follow Save control');
    assert.ok(alertIdx - saveIdx < 900, 'save alert should be adjacent to Save control');
    assert.equal(bottomFail, -1, 'failure copy should not be buried at form bottom');
  });

  try {
    fs.rmSync(outDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  if (failed) {
    process.stderr.write(`\n${failed} failed, ${passed} passed\n`);
    process.exit(1);
  }
  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
