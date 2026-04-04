/**
 * Spec A: inventory training videos vs local public/training + Vercel Blob prefix training/
 * Run: node scripts/training-video-blob-audit.mjs
 * Loads agnes-next/.env.local for BLOB_READ_WRITE_TOKEN + NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL (no secrets logged)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { list, put } from '@vercel/blob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicTraining = path.join(root, 'public', 'training');

/** Mirrors src/lib/trainingVideoUrl.ts TRAINING_VIDEO_FILES — keep in sync */
const TRAINING_VIDEO_FILES = {
  fbInstructionsIos: 'fb-instructions-iPhone.mp4',
  fbInstructionsAndroid: 'fb-instructions-android.mp4',
  xInstructionsIos: 'x-instructions-iPhone.mp4',
  xInstructionsAndroid: 'x-instructions-android.mp4',
  ttInstructionsIos: 'tt-instructions-ios.mp4',
  ttInstructionsAndroid: 'tt-instructions-android.mp4',
  igInstructionsIos: 'ig-instructions-ios.mp4',
  jodyIgTraining: 'jody-ig-training.mp4',
  jodyTiktokTraining: 'jody-tiktok-training.mp4',
  jodyTruthTraining: 'jody-truth-training.mp4',
};

const PLATFORM_LABEL = {
  fbInstructionsIos: 'fb · iPhone instructions',
  fbInstructionsAndroid: 'fb · Android instructions',
  xInstructionsIos: 'x · iPhone instructions',
  xInstructionsAndroid: 'x · Android instructions',
  ttInstructionsIos: 'tt · iOS instructions',
  ttInstructionsAndroid: 'tt · Android instructions',
  igInstructionsIos: 'ig · iOS instructions',
  jodyIgTraining: 'jody · ig training',
  jodyTiktokTraining: 'jody · tiktok training',
  jodyTruthTraining: 'jody · truth training',
};

function loadEnvLocal() {
  const p = path.join(root, '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function localFilesSet() {
  if (!fs.existsSync(publicTraining)) return new Set();
  return new Set(
    fs
      .readdirSync(publicTraining, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name)
  );
}

async function main() {
  loadEnvLocal();
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const baseUrl = process.env.NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL?.replace(/\/$/, '');

  const locals = localFilesSet();
  const expected = Object.entries(TRAINING_VIDEO_FILES);

  /** pathname -> true */
  let blobNames = new Set();
  if (token) {
    try {
      let cursor;
      do {
        const res = await list({ prefix: 'training/', token, limit: 1000, cursor });
        for (const b of res.blobs) {
          const pathname = b.pathname || '';
          const base = pathname.startsWith('training/') ? pathname.slice('training/'.length) : pathname;
          blobNames.add(base);
        }
        cursor = res.cursor;
      } while (cursor);
    } catch (e) {
      console.error('[blob list failed]', e.message);
    }
  } else {
    console.warn('[no BLOB_READ_WRITE_TOKEN] skipping blob list/upload');
  }

  const rows = [];
  for (const [key, filename] of expected) {
    const localPath = path.join(publicTraining, filename);
    const hasLocal = fs.existsSync(localPath);
    const hasBlob = blobNames.has(filename);
    rows.push({
      key,
      platform: PLATFORM_LABEL[key] || key,
      filename,
      hasLocal,
      hasBlob,
    });
  }

  console.log('\n=== INVENTORY (expected filename | local | blob) ===\n');
  console.log('| expected filename | platform (spec) | local | blob |');
  console.log('|---|---|:---:|---:|');
  for (const r of rows) {
    console.log(
      `| ${r.filename} | ${r.platform} | ${r.hasLocal ? 'yes' : 'no'} | ${token ? (r.hasBlob ? 'yes' : 'no') : 'n/a'} |`
    );
  }

  const missingLocal = rows.filter((r) => !r.hasLocal).map((r) => r.filename);
  const missingBlob = token ? rows.filter((r) => r.hasLocal && !r.hasBlob) : [];
  const mismatchedLocal = [...locals].filter((f) => ![...expected].some(([, fn]) => fn === f));

  console.log('\n=== MISSING (recover from CapCut / sources) ===');
  console.log(JSON.stringify(missingLocal, null, 2));

  console.log('\n=== MISMATCHED LOCAL NAMES (not canonical — manual rename + re-upload) ===');
  console.log(JSON.stringify(mismatchedLocal, null, 2));

  if (token && missingBlob.length) {
    console.log('\n=== UPLOADING (overwrite) canonical local files → training/ ===\n');
    for (const r of missingBlob) {
      const localPath = path.join(publicTraining, r.filename);
      const buf = fs.readFileSync(localPath);
      const pathname = `training/${r.filename}`;
      await put(pathname, buf, {
        access: 'public',
        token,
        allowOverwrite: true,
        contentType: 'video/mp4',
      });
      console.log('uploaded', pathname);
    }
  } else if (token) {
    console.log('\n[upload] all expected files already present in blob (or none to sync)');
  }

  if (baseUrl && token) {
    console.log('\n=== FULL URL VERIFY (HEAD) per NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL ===\n');
    let allOk = true;
    for (const r of rows) {
      const url = `${baseUrl}/${r.filename}`;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        const ok = res.ok;
        if (!ok) allOk = false;
        console.log(r.filename, res.status, ok ? 'OK' : 'FAIL');
      } catch (e) {
        allOk = false;
        console.log(r.filename, 'FETCH_ERR', e.message);
      }
    }
    console.log(allOk ? '\n[all expected URLs OK]' : '\n[some URLs failed]');

    console.log('\n=== SAMPLE PROOF URLS (first 3) ===\n');
    for (const r of rows.slice(0, 3)) {
      console.log(`${baseUrl}/${r.filename}`);
    }
  } else if (baseUrl) {
    console.log('\n[sample URLs]', `${baseUrl}/fb-instructions-iPhone.mp4`, `(set token to verify blob list)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
