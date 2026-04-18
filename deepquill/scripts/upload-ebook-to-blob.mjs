/**
 * Upload deepquill/assets/ebook/the-agnes-protocol.epub to Vercel Blob (public).
 * Requires BLOB_READ_WRITE_TOKEN in .env or environment (Vercel dashboard → Blob store).
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { put } from '@vercel/blob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

config({ path: join(root, '.env.local') });
config({ path: join(root, '.env') });

const EPUB_NAME = 'the-agnes-protocol.epub';
const localPath = join(root, 'assets', 'ebook', EPUB_NAME);

if (!existsSync(localPath)) {
  console.error(`File not found: ${localPath}`);
  process.exit(1);
}

if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
  console.error(
    'Missing BLOB_READ_WRITE_TOKEN. Add it from Vercel → Storage → Blob → .env.local snippet, or export it in the shell.'
  );
  process.exit(1);
}

const buf = readFileSync(localPath);

const blob = await put(EPUB_NAME, buf, {
  access: 'public',
});

console.log('Upload OK (public)');
console.log('URL:', blob.url);
console.log(JSON.stringify({ url: blob.url, pathname: blob.pathname }, null, 2));
