#!/usr/bin/env node
/**
 * One-time script: Upload 10 training videos from public/training to Vercel Blob.
 *
 * Prerequisites:
 * - Vercel Blob store connected to this project
 * - BLOB_READ_WRITE_TOKEN in .env.local (run: vercel env pull)
 * - All 10 video files present in agnes-next/public/training/
 *
 * Usage:
 *   cd agnes-next && node scripts/upload-training-videos-to-blob.js
 *   cd agnes-next && node scripts/upload-training-videos-to-blob.js --yes   # skip confirmation
 */

const fs = require('fs');
const path = require('path');
const { put } = require('@vercel/blob');

const TRAINING_DIR = path.join(__dirname, '..', 'public', 'training');
const BLOB_PREFIX = 'training';

const FILES = [
  'fb-instructions-iPhone.mp4',
  'fb-instructions-android.mp4',
  'x-instructions-iPhone.mp4',
  'x-instructions-android.mp4',
  'tt-instructions-ios.mp4',
  'tt-instructions-android.mp4',
  'ig-instructions-ios.mp4',
  'jody-tiktok-training.mp4',
  'jody-truth-training.mp4',
  'jody-ig-training.mp4',
];

async function main() {
  const skipConfirm = process.argv.includes('--yes');

  console.log('=== Training Video Upload to Vercel Blob ===\n');

  // 1. Load .env.local if present (Node does not auto-load it)
  const envLocalPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^BLOB_READ_WRITE_TOKEN=(.+)$/);
      if (match) {
        const val = match[1].trim().replace(/^["']|["']$/g, '');
        if (val) process.env.BLOB_READ_WRITE_TOKEN = val;
        break;
      }
    }
  }

  // 2. Check token
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('ERROR: BLOB_READ_WRITE_TOKEN is not set.');
    console.error('  1. Ensure a Vercel Blob store is connected to this project.');
    console.error('  2. Run: vercel env pull');
    console.error('  3. Ensure .env.local contains BLOB_READ_WRITE_TOKEN.');
    process.exit(1);
  }

  // 3. Verify all files exist
  const missing = [];
  for (const file of FILES) {
    const filePath = path.join(TRAINING_DIR, file);
    if (!fs.existsSync(filePath)) {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    console.error('ERROR: Missing files in', TRAINING_DIR);
    missing.forEach((f) => console.error('  -', f));
    process.exit(1);
  }

  // 4. Confirm unless --yes
  if (!skipConfirm) {
    console.log('About to upload 10 training videos to Vercel Blob.');
    console.log('Source:', path.resolve(TRAINING_DIR));
    console.log('Blob path prefix:', BLOB_PREFIX + '/');
    console.log('\nPress Ctrl+C to cancel, or run with --yes to skip this prompt.\n');
    await new Promise((resolve) => {
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('Continue? [y/N] ', (answer) => {
        rl.close();
        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log('Aborted.');
          process.exit(0);
        }
        resolve();
      });
    });
  }

  // 5. Upload each file
  const results = [];
  for (const file of FILES) {
    const filePath = path.join(TRAINING_DIR, file);
    const pathname = `${BLOB_PREFIX}/${file}`;
    process.stdout.write(`Uploading ${file}... `);
    try {
      const buffer = fs.readFileSync(filePath);
      const blob = await put(pathname, buffer, {
        access: 'public',
        contentType: 'video/mp4',
        multipart: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      results.push({ file, url: blob.url });
      console.log('OK');
    } catch (err) {
      console.log('FAILED');
      console.error(err.message || err);
      process.exit(1);
    }
  }

  // 6. Print results
  console.log('\n--- Uploaded URLs ---\n');
  for (const { file, url } of results) {
    console.log(`${file}`);
    console.log(`  ${url}\n`);
  }

  // 7. Derive and print base URL
  const firstUrl = results[0]?.url;
  if (firstUrl) {
    const baseUrl = firstUrl.replace(/\/[^/]+\.mp4$/, '');
    console.log('--- NEXT_PUBLIC_TRAINING_VIDEO_BASE_URL ---\n');
    console.log(baseUrl);
    console.log('\nAdd this to Vercel Environment Variables (and .env.local for local dev).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
