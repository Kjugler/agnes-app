#!/usr/bin/env node
/**
 * Local POST-only checks for the Reader Manager lifecycle Next.js mutation proxy.
 * Uses a mocked Deepquill backend on loopback. Never calls production.
 * Never touches databases, including deepquill/dev.db.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGNES_NEXT_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(AGNES_NEXT_ROOT, '..');
const HELPER_TS = path.join(AGNES_NEXT_ROOT, 'src', 'lib', 'readerLifecycleAdminProxy.ts');
const DEV_DB = path.join(REPO_ROOT, 'deepquill', 'dev.db');
const CANONICAL_DEV_DB_SHA256 = 'D5BB5C158FC22843EDD0A4990F8921C35437B8904E0DEE11F52C712F81227DFB';

const ADMIN_KEY = 'checkpoint5d-synthetic-admin-key-not-for-production';
const FULFILLMENT_TOKEN = 'checkpoint5d-synthetic-fulfillment-token';
const SESSION_COOKIE = `fulfillment-token=${FULFILLMENT_TOKEN}`;
const IDEMPOTENCY_KEY = 'ckpt5d-idem-01';
const VALID_BODY = Object.freeze({
  kind: 'manual_amazon',
  reason: 'Known Amazon purchase evidence',
  actorId: 'helper_1',
});
const FAKE_PII = Object.freeze({
  email: 'victim.reader@example.test',
  phone: '+15551210999',
  name: 'Victim Reader',
  notes: 'secret medical note about Victim Reader',
  cookie: SESSION_COOKIE,
  adminKey: ADMIN_KEY,
  fulfillmentToken: FULFILLMENT_TOKEN,
  idempotencyKey: 'ckpt5d-secret-idem-key',
});
const BODY_SECRET = 'ckpt5d-body-secret-should-not-leak';

const GET_ROUTE_FILES = [
  'readers/route.ts',
  'readers/[readerProfileId]/route.ts',
  'users/[userId]/route.ts',
  'review-queue/route.ts',
  'communications/route.ts',
  'purchases-without-profile/route.ts',
];

const MUTATION_ROUTE_FILES = [
  ['readers/[readerProfileId]/evidence/route.ts', 'addEvidence'],
  ['evidence/[evidenceId]/confirm/route.ts', 'confirmEvidence'],
  ['evidence/[evidenceId]/correct/route.ts', 'correctEvidence'],
  ['evidence/[evidenceId]/dispute/route.ts', 'disputeEvidence'],
  ['evidence/[evidenceId]/replace/route.ts', 'replaceEvidence'],
  ['readers/[readerProfileId]/contact-decisions/route.ts', 'addContactDecision'],
  ['readers/[readerProfileId]/archive/route.ts', 'archiveReader'],
  ['readers/[readerProfileId]/restore/route.ts', 'restoreReader'],
  ['readers/[readerProfileId]/identity-reviews/route.ts', 'openIdentityReview'],
  ['identity-reviews/[reviewId]/resolve/route.ts', 'resolveIdentityReview'],
];

const MAPPINGS = [
  [{ route: 'addEvidence', readerProfileId: 'rp_abc123' }, '/api/admin/reader-lifecycle/readers/rp_abc123/evidence'],
  [{ route: 'confirmEvidence', evidenceId: 'ev_abc123' }, '/api/admin/reader-lifecycle/evidence/ev_abc123/confirm'],
  [{ route: 'correctEvidence', evidenceId: 'ev_abc123' }, '/api/admin/reader-lifecycle/evidence/ev_abc123/correct'],
  [{ route: 'disputeEvidence', evidenceId: 'ev_abc123' }, '/api/admin/reader-lifecycle/evidence/ev_abc123/dispute'],
  [{ route: 'replaceEvidence', evidenceId: 'ev_abc123' }, '/api/admin/reader-lifecycle/evidence/ev_abc123/replace'],
  [{ route: 'addContactDecision', readerProfileId: 'rp_abc123' }, '/api/admin/reader-lifecycle/readers/rp_abc123/contact-decisions'],
  [{ route: 'archiveReader', readerProfileId: 'rp_abc123' }, '/api/admin/reader-lifecycle/readers/rp_abc123/archive'],
  [{ route: 'restoreReader', readerProfileId: 'rp_abc123' }, '/api/admin/reader-lifecycle/readers/rp_abc123/restore'],
  [{ route: 'openIdentityReview', readerProfileId: 'rp_abc123' }, '/api/admin/reader-lifecycle/readers/rp_abc123/identity-reviews'],
  [{ route: 'resolveIdentityReview', reviewId: 'ir_abc123' }, '/api/admin/reader-lifecycle/identity-reviews/ir_abc123/resolve'],
];

const READERS_PROXY_FILES = [
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'readers', 'route.ts'),
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'readers', '[id]', 'route.ts'),
];

const FORBIDDEN_IMPORTS = [
  'mailchimp',
  'nodemailer',
  'referral',
  'backfill',
  '$queryRaw',
  '$executeRaw',
  'prisma',
  'nurture',
  'text-a-friend',
  'textAFriend',
  'webhook',
  'accounting',
];

const LIFECYCLE_DIR = path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'reader-lifecycle');
const DEFAULT_TARGET = MAPPINGS[0][0];
const DEFAULT_PATH = MAPPINGS[0][1];

let passed = 0;
let failed = 0;
const capturedLogs = [];

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

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walkFiles(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

function extractExportedFunction(src, name) {
  const needle = `export async function ${name}`;
  const start = src.indexOf(needle);
  if (start === -1) throw new Error(`missing ${name}`);
  const paramsEnd = src.indexOf(')', start);
  if (paramsEnd === -1) throw new Error(`missing params for ${name}`);
  const brace = src.indexOf('{', paramsEnd);
  if (brace === -1) throw new Error(`missing body for ${name}`);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function transpileHelper() {
  const require = createRequire(path.join(AGNES_NEXT_ROOT, 'package.json'));
  const ts = require('typescript');
  const source = fs.readFileSync(HELPER_TS, 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    fileName: 'readerLifecycleAdminProxy.ts',
    reportDiagnostics: true,
  });
  if (diagnostics && diagnostics.length) {
    const msg = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n');
    throw new Error(`helper transpile failed: ${msg}`);
  }
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint5d-'));
  const outFile = path.join(outDir, 'readerLifecycleAdminProxy.mjs');
  fs.writeFileSync(outFile, outputText);
  return { outDir, outFile };
}

async function loadHelper() {
  const { outDir, outFile } = transpileHelper();
  const mod = await import(pathToFileURL(outFile).href);
  return { mod, outDir };
}

function makePostRequest(urlPath, { cookie, headers, body, idempotencyKey } = {}) {
  const h = new Headers(headers || {});
  if (cookie) h.set('cookie', cookie);
  if (idempotencyKey) h.set('Idempotency-Key', idempotencyKey);
  const init = { method: 'POST', headers: h };
  if (body !== undefined) {
    if (!h.has('content-type')) h.set('content-type', 'application/json');
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(`http://agnes-next.local${urlPath}`, init);
}

function startMockBackend(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      Promise.resolve(handler(req, res)).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'mock_handler_failed' }));
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        port,
      });
    });
  });
}

function readReqBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function collectRequest(req) {
  return {
    method: req.method,
    url: req.url,
    pathname: new URL(req.url, 'http://127.0.0.1').pathname,
    search: new URL(req.url, 'http://127.0.0.1').search,
    headers: req.headers,
  };
}

function assertNoSecret(haystack, label) {
  const text = typeof haystack === 'string' ? haystack : JSON.stringify(haystack);
  assert.equal(text.includes(ADMIN_KEY), false, `${label} leaked ADMIN_KEY`);
  assert.equal(text.includes(FULFILLMENT_TOKEN), false, `${label} leaked FULFILLMENT_ACCESS_TOKEN`);
  assert.equal(text.includes(IDEMPOTENCY_KEY), false, `${label} leaked Idempotency-Key`);
  assert.equal(text.includes(BODY_SECRET), false, `${label} leaked body secret`);
  assert.equal(text.includes(FAKE_PII.email), false, `${label} leaked email`);
  assert.equal(text.includes(FAKE_PII.phone), false, `${label} leaked phone`);
  assert.equal(text.includes(FAKE_PII.notes), false, `${label} leaked notes`);
}

async function readResponse(res) {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: res.status,
    text,
    json,
    cacheControl: res.headers.get('cache-control'),
    contentType: res.headers.get('content-type'),
  };
}

function envFor(baseUrl, extra = {}) {
  return {
    DEEPQUILL_URL: baseUrl,
    ADMIN_KEY,
    FULFILLMENT_ACCESS_TOKEN: FULFILLMENT_TOKEN,
    ...extra,
  };
}

function gitDiff(file) {
  const result = spawnSync('git', ['diff', '--', file], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return (result.stdout || '').trim();
}

function jsonOk(payload = { ok: true, replay: false }) {
  return (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  };
}

async function postDefault(mod, { cookie = SESSION_COOKIE, headers, body = VALID_BODY, idempotencyKey = IDEMPOTENCY_KEY, env, urlPath = DEFAULT_PATH, target = DEFAULT_TARGET, fetchImpl, log } = {}) {
  return mod.proxyReaderLifecyclePost(
    makePostRequest(urlPath, { cookie, headers, body, idempotencyKey }),
    target,
    { env, fetchImpl, log },
  );
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

function httpCall({ port, method, urlPath, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: headers || {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode,
            text,
            json,
            headers: res.headers,
            cacheControl: res.headers['cache-control'],
            contentType: res.headers['content-type'],
          });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* already exited */
  }
}

function startNextDev({ mockBaseUrl, port }) {
  const nextBin = path.join(AGNES_NEXT_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const env = {
    ...process.env,
    DEEPQUILL_URL: mockBaseUrl,
    NEXT_PUBLIC_API_BASE_URL: mockBaseUrl,
    ADMIN_KEY,
    FULFILLMENT_ACCESS_TOKEN: FULFILLMENT_TOKEN,
    NEXT_PUBLIC_SITE_URL: 'https://www.theagnesprotocol.com',
    SITE_URL: 'https://www.theagnesprotocol.com',
    PORT: String(port),
  };
  const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: AGNES_NEXT_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = [];
  const onData = (buf) => {
    output.push(buf.toString('utf8'));
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  return { child, output };
}

function waitForNextReady(handle, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const blob = handle.output.join('');
      if (/ready in/i.test(blob) || /started server/i.test(blob) || /local:/i.test(blob)) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (handle.child.exitCode != null) {
        clearInterval(timer);
        reject(new Error(`next dev exited early: ${blob.slice(-800)}`));
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`next dev did not become ready: ${blob.slice(-800)}`));
      }
    }, 250);
  });
}

async function main() {
  const initialDbHash = sha256File(DEV_DB);
  assert.equal(initialDbHash, CANONICAL_DEV_DB_SHA256, 'dev.db hash changed before tests');

  const { mod, outDir } = await loadHelper();
  const {
    proxyReaderLifecyclePost,
    proxyReaderLifecycleGet,
    backendMutationPathFor,
    backendPathFor,
    encodePathId,
    readIdempotencyKey,
    MAX_MUTATION_BODY_BYTES,
    MAX_MUTATION_BODY_INSPECT_DEPTH,
    MAX_MUTATION_BODY_INSPECT_KEYS,
    mutationBodyHasForbiddenFields,
    BACKEND_NAMESPACE,
  } = mod;

  const origError = console.error;
  console.error = (...args) => {
    capturedLogs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };

  try {
    await check('helper transpiles without Next.js imports', () => {
      const src = fs.readFileSync(HELPER_TS, 'utf8');
      const getFn = extractExportedFunction(src, 'proxyReaderLifecycleGet');
      const postFn = extractExportedFunction(src, 'proxyReaderLifecyclePost');
      assert.equal(/from ['"]next\//.test(src), false);
      assert.match(src, /proxyReaderLifecycleGet/);
      assert.match(src, /proxyReaderLifecyclePost/);
      assert.match(getFn, /method:\s*'GET'/);
      assert.match(postFn, /method:\s*'POST'/);
      assert.doesNotMatch(src, /LIFECYCLE_MUTATION_HTTP_METHOD/);
      assert.doesNotMatch(src, /method:\s*[a-zA-Z_$]/);
      assert.doesNotMatch(src, /NEXT_PUBLIC_ADMIN_KEY/);
    });

    await check('explicit POST route files exist and export POST only', () => {
      for (const [rel, routeName] of MUTATION_ROUTE_FILES) {
        const file = path.join(LIFECYCLE_DIR, rel);
        assert.equal(fs.existsSync(file), true, `missing ${rel}`);
        const src = fs.readFileSync(file, 'utf8');
        assert.match(src, /export async function POST/);
        assert.doesNotMatch(src, /export async function (GET|PATCH|PUT|DELETE)/);
        assert.match(src, /proxyReaderLifecyclePost/);
        assert.doesNotMatch(src, /proxyReaderLifecycleGet/);
        assert.doesNotMatch(src, /req\.method/);
        assert.match(src, new RegExp(`route: '${routeName}'`));
        assert.match(src, /dynamic = 'force-dynamic'/);
        assert.match(src, /revalidate = 0/);
      }
      const catchAll = walkFiles(LIFECYCLE_DIR).filter((f) => f.includes('[...'));
      assert.equal(catchAll.length, 0, 'catch-all proxy route is not allowed');
    });

    await check('existing GET lifecycle route files remain GET-only and unmodified', () => {
      for (const rel of GET_ROUTE_FILES) {
        const file = path.join(LIFECYCLE_DIR, rel);
        assert.equal(fs.existsSync(file), true, `missing GET ${rel}`);
        assert.equal(gitDiff(file), '', `GET route was modified: ${rel}`);
        const src = fs.readFileSync(file, 'utf8');
        assert.match(src, /export async function GET/);
        assert.doesNotMatch(src, /export async function (POST|PATCH|PUT|DELETE)/);
        assert.match(src, /proxyReaderLifecycleGet/);
        assert.doesNotMatch(src, /proxyReaderLifecyclePost/);
      }
    });

    await check('missing cookie is rejected before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        jsonOk()(_req, res);
      });
      try {
        const body = await readResponse(
          await postDefault(mod, { cookie: '', env: envFor(baseUrl) }),
        );
        assert.equal(body.status, 401);
        assert.equal(body.json.error, 'unauthorized');
        assert.equal(body.cacheControl, 'no-store');
        assert.match(body.contentType, /application\/json/);
        assert.equal(backendHits, 0);
        assertNoSecret(body.text, 'missing cookie');
      } finally {
        server.close();
      }
    });

    await check('empty and whitespace cookies are rejected before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        for (const cookie of ['fulfillment-token=', 'fulfillment-token=   ']) {
          const body = await readResponse(
            await postDefault(mod, { cookie, env: envFor(baseUrl) }),
          );
          assert.equal(body.status, 401, cookie);
          assert.equal(body.json.error, 'unauthorized');
          assert.equal(body.cacheControl, 'no-store');
        }
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('wrong same-length, short, and long cookies are rejected before backend', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const cookies = [
          `fulfillment-token=${'x'.repeat(FULFILLMENT_TOKEN.length)}`,
          'fulfillment-token=nope',
          `fulfillment-token=${FULFILLMENT_TOKEN}-extra`,
        ];
        for (const cookie of cookies) {
          const body = await readResponse(
            await postDefault(mod, { cookie, env: envFor(baseUrl) }),
          );
          assert.equal(body.status, 401, cookie);
          assert.equal(body.json.error, 'unauthorized');
        }
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('unicode and malformed cookies return 401 not 500', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const cookies = [
          'fulfillment-token=%E2%9C%93-not-the-token',
          'fulfillment-token=%00%01%02',
          'fulfillment-token=%ZZ',
          `fulfillment-token=${encodeURIComponent('token-с-юникодом')}`,
        ];
        for (const cookie of cookies) {
          const body = await readResponse(
            await postDefault(mod, { cookie, env: envFor(baseUrl) }),
          );
          assert.equal(body.status, 401, cookie);
          assert.notEqual(body.status, 500, cookie);
          assert.equal(body.json.error, 'unauthorized');
          assert.equal(body.cacheControl, 'no-store');
        }
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('correct cookie reaches mock backend with server admin key only', async () => {
      let seen = null;
      const { server, baseUrl } = await startMockBackend(async (req, res) => {
        seen = collectRequest(req);
        seen.body = await readReqBody(req);
        jsonOk()(req, res);
      });
      try {
        const body = await readResponse(
          await postDefault(mod, {
            headers: {
              'x-admin-key': 'client-supplied-key-must-be-ignored',
              authorization: 'Bearer browser-token',
            },
            env: envFor(baseUrl),
          }),
        );
        assert.equal(body.status, 200);
        assert.equal(seen.method, 'POST');
        assert.equal(seen.pathname, DEFAULT_PATH);
        assert.equal(seen.search, '');
        assert.equal(seen.headers['x-admin-key'], ADMIN_KEY);
        assert.equal(seen.headers.cookie, undefined);
        assert.equal(seen.headers.authorization, undefined);
        assert.equal(seen.headers['idempotency-key'], IDEMPOTENCY_KEY);
        assert.deepEqual(JSON.parse(seen.body), VALID_BODY);
        assert.equal(body.cacheControl, 'no-store');
        assert.match(body.contentType, /application\/json/);
        assertNoSecret(body.text, 'success response');
      } finally {
        server.close();
      }
    });

    await check('missing FULFILLMENT_ACCESS_TOKEN fails closed before backend', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const body = await readResponse(
          await postDefault(mod, { env: envFor(baseUrl, { FULFILLMENT_ACCESS_TOKEN: '' }) }),
        );
        assert.equal(body.status, 500);
        assert.equal(body.json.error, 'admin_not_configured');
        assert.equal(body.cacheControl, 'no-store');
        assert.equal(backendHits, 0);
        assertNoSecret(body.text, 'missing fulfillment token config');
      } finally {
        server.close();
      }
    });

    await check('missing ADMIN_KEY or backend URL fail closed before backend', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const noKey = await readResponse(
          await postDefault(mod, { env: envFor(baseUrl, { ADMIN_KEY: '' }) }),
        );
        assert.equal(noKey.status, 500);
        assert.equal(noKey.json.error, 'admin_not_configured');

        const noUrl = await readResponse(
          await postDefault(mod, {
            env: { ADMIN_KEY, FULFILLMENT_ACCESS_TOKEN: FULFILLMENT_TOKEN },
          }),
        );
        assert.equal(noUrl.status, 500);
        assert.equal(noUrl.json.error, 'admin_not_configured');

        const badUrl = await readResponse(
          await postDefault(mod, { env: envFor('not-a-url') }),
        );
        assert.equal(badUrl.status, 500);
        assert.equal(badUrl.json.error, 'admin_not_configured');
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('all fixed route mappings reach the exact backend paths', async () => {
      const hits = [];
      const { server, baseUrl } = await startMockBackend(async (req, res) => {
        const seen = collectRequest(req);
        seen.body = await readReqBody(req);
        hits.push(seen);
        jsonOk()(req, res);
      });
      try {
        for (const [target, expected] of MAPPINGS) {
          const body = await readResponse(
            await postDefault(mod, { env: envFor(baseUrl), urlPath: expected, target }),
          );
          assert.equal(body.status, 200, expected);
          assert.equal(hits[hits.length - 1].pathname, expected);
          assert.equal(hits[hits.length - 1].method, 'POST');
          assert.equal(hits[hits.length - 1].headers['x-admin-key'], ADMIN_KEY);
          assert.equal(hits[hits.length - 1].headers.cookie, undefined);
        }
        assert.equal(hits.length, MAPPINGS.length);
      } finally {
        server.close();
      }
    });

    await check('dynamic IDs are encoded and path injection is rejected', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        assert.equal(
          backendMutationPathFor({ route: 'addEvidence', readerProfileId: 'rp_plus+id' }),
          `${BACKEND_NAMESPACE}/readers/rp_plus%2Bid/evidence`,
        );
        assert.equal(encodePathId('rp_plus+id'), 'rp_plus%2Bid');

        const encoded = await startMockBackend(async (req, res) => {
          const seen = collectRequest(req);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, path: seen.pathname }));
        });
        try {
          const body = await readResponse(
            await postDefault(mod, {
              env: envFor(encoded.baseUrl),
              urlPath: '/api/admin/reader-lifecycle/readers/rp_plus+id/evidence',
              target: { route: 'addEvidence', readerProfileId: 'rp_plus+id' },
            }),
          );
          assert.equal(body.status, 200);
          assert.equal(body.json.path, '/api/admin/reader-lifecycle/readers/rp_plus%2Bid/evidence');
        } finally {
          encoded.server.close();
        }

        const injections = ['../users/evil', '../../secret', 'a/b', 'a\\b', 'foo?x=1', 'foo#hash', '..', '.', 'x/../y'];
        for (const readerProfileId of injections) {
          const body = await readResponse(
            await postDefault(mod, {
              env: envFor(baseUrl),
              urlPath: `/api/admin/reader-lifecycle/readers/${encodeURIComponent(readerProfileId)}/evidence`,
              target: { route: 'addEvidence', readerProfileId },
            }),
          );
          assert.equal(body.status, 400, readerProfileId);
          assert.equal(body.json.error, 'invalid_request');
          assert.equal(body.cacheControl, 'no-store');
        }
        assert.equal(backendHits, 0);
        assert.equal(backendMutationPathFor({ route: 'addEvidence', readerProfileId: '../users/evil' }), null);
      } finally {
        server.close();
      }
    });

    await check('query strings and caller-controlled hosts cannot change the backend target', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const queries = [
          '?x=1',
          '?url=http://evil.example',
          '?backend=http://evil.example/api/admin/reader-lifecycle/readers',
        ];
        for (const qs of queries) {
          const body = await readResponse(
            await postDefault(mod, {
              env: envFor(baseUrl),
              urlPath: `${DEFAULT_PATH}${qs}`,
              headers: { host: 'evil.example', 'x-admin-key': 'from-browser' },
            }),
          );
          assert.equal(body.status, 400, qs);
          assert.equal(body.json.error, 'invalid_request');
        }
        assert.equal(backendHits, 0);
        assert.equal(backendPathFor({ route: 'readers' }), `${BACKEND_NAMESPACE}/readers`);
      } finally {
        server.close();
      }
    });

    await check('missing empty malformed oversized and multiple idempotency keys are rejected', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const missing = await readResponse(
          await postDefault(mod, { env: envFor(baseUrl), idempotencyKey: '' }),
        );
        assert.equal(missing.status, 400);

        const emptyHeader = await readResponse(
          await proxyReaderLifecyclePost(
            makePostRequest(DEFAULT_PATH, {
              cookie: SESSION_COOKIE,
              headers: { 'content-type': 'application/json', 'Idempotency-Key': '   ' },
              body: VALID_BODY,
            }),
            DEFAULT_TARGET,
            { env: envFor(baseUrl) },
          ),
        );
        assert.equal(emptyHeader.status, 400);

        const malformed = ['short', 'bad key', 'has/slash', 'has space', 'unicodé-key', 'a'.repeat(129)];
        for (const key of malformed) {
          const body = await readResponse(
            await postDefault(mod, { env: envFor(baseUrl), idempotencyKey: key }),
          );
          assert.equal(body.status, 400, key);
          assert.equal(body.json.error, 'invalid_request');
          assert.equal(body.text.includes(key), false, 'key leaked in response');
        }

        const headers = new Headers();
        headers.set('content-type', 'application/json');
        headers.set('cookie', SESSION_COOKIE);
        headers.append('Idempotency-Key', 'ckpt5d-idem-01');
        headers.append('Idempotency-Key', 'ckpt5d-idem-02');
        const multiple = await readResponse(
          await proxyReaderLifecyclePost(
            new Request(`http://agnes-next.local${DEFAULT_PATH}`, {
              method: 'POST',
              headers,
              body: JSON.stringify(VALID_BODY),
            }),
            DEFAULT_TARGET,
            { env: envFor(baseUrl) },
          ),
        );
        assert.equal(multiple.status, 400);
        assert.equal(backendHits, 0);
        assert.equal(readIdempotencyKey(makePostRequest(DEFAULT_PATH, { idempotencyKey: IDEMPOTENCY_KEY })), IDEMPOTENCY_KEY);
      } finally {
        server.close();
      }
    });

    await check('valid idempotency key is forwarded exactly and omitted from response', async () => {
      let seen = null;
      const { server, baseUrl } = await startMockBackend(async (req, res) => {
        seen = collectRequest(req);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, replay: true, warnings: [], mutation: { action: 'addEvidence' } }));
      });
      try {
        const key = '  ckpt5d-replay-key  ';
        const body = await readResponse(
          await postDefault(mod, { env: envFor(baseUrl), idempotencyKey: key }),
        );
        assert.equal(body.status, 200);
        assert.equal(body.json.replay, true);
        assert.deepEqual(body.json.mutation, { action: 'addEvidence' });
        assert.equal(seen.headers['idempotency-key'], 'ckpt5d-replay-key');
        assert.equal(body.text.includes('ckpt5d-replay-key'), false);
        assert.equal(body.cacheControl, 'no-store');
      } finally {
        server.close();
      }
    });

    await check('valid JSON object is forwarded unchanged and invalid bodies are rejected', async () => {
      let seen = null;
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend(async (req, res) => {
        backendHits += 1;
        seen = collectRequest(req);
        seen.body = await readReqBody(req);
        jsonOk()(req, res);
      });
      try {
        const raw = '{"kind":"manual_bn","reason":"Known B&N purchase evidence","actorId":"helper_1"}';
        const ok = await readResponse(
          await postDefault(mod, { env: envFor(baseUrl), body: raw }),
        );
        assert.equal(ok.status, 200);
        assert.equal(seen.body, raw);

        const rejected = [
          { body: '', label: 'empty' },
          { body: '{', label: 'invalid json' },
          { body: '[1,2]', label: 'array' },
          { body: '"string"', label: 'string primitive' },
          { body: '123', label: 'number primitive' },
          { body: 'true', label: 'boolean primitive' },
          { body: 'null', label: 'null' },
        ];
        const hitsAfterForward = 1;
        for (const item of rejected) {
          const body = await readResponse(
            await postDefault(mod, { env: envFor(baseUrl), body: item.body }),
          );
          assert.equal(body.status, 400, item.label);
          assert.equal(body.json.error, 'invalid_request');
          if (item.body.length > 2) {
            assert.equal(body.text.includes(item.body), false, item.label);
          }
        }
        assert.equal(
          (await readResponse(
            await proxyReaderLifecyclePost(
              makePostRequest(DEFAULT_PATH, {
                cookie: SESSION_COOKIE,
                headers: { 'content-type': 'text/plain' },
                body: JSON.stringify(VALID_BODY),
                idempotencyKey: IDEMPOTENCY_KEY,
              }),
              DEFAULT_TARGET,
              { env: envFor(baseUrl) },
            ),
          )).status,
          400,
        );
        const oversized = `{"notes":"${'n'.repeat(MAX_MUTATION_BODY_BYTES)}"}`;
        const over = await readResponse(
          await postDefault(mod, { env: envFor(baseUrl), body: oversized }),
        );
        assert.equal(over.status, 400);
        assert.equal(over.text.includes('nnnn'), false);
        assert.equal(backendHits, hitsAfterForward);
      } finally {
        server.close();
      }
    });

    await check('forbidden credential and config fields are rejected before backend', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        assert.equal(MAX_MUTATION_BODY_INSPECT_DEPTH, 3);
        assert.equal(MAX_MUTATION_BODY_INSPECT_KEYS, 48);
        assert.equal(mutationBodyHasForbiddenFields({ kind: 'manual_amazon' }), false);

        const forbiddenKeys = [
          'ADMIN_KEY',
          'Next_Public_Admin_Key',
          'FULFILLMENT_ACCESS_TOKEN',
          'fulfillment-token',
          'X-Admin-Key',
          'Authorization',
          'DEEPQUILL_URL',
          'NEXT_PUBLIC_API_BASE_URL',
          'backend',
          'backendUrl',
          'url',
          'READER_LIFECYCLE_MUTATIONS_ENABLED',
          'reader_lifecycle_editing_enabled',
          'READER_LIFECYCLE_SYNTHETIC_PREVIEW',
        ];
        for (const key of forbiddenKeys) {
          const raw = JSON.stringify({
            kind: 'manual_amazon',
            reason: 'Known Amazon purchase evidence',
            actorId: 'helper_1',
            [key]: BODY_SECRET,
          });
          const body = await readResponse(
            await postDefault(mod, { env: envFor(baseUrl), body: raw }),
          );
          assert.equal(body.status, 400, key);
          assert.equal(body.json.error, 'invalid_request');
          assert.equal(body.cacheControl, 'no-store');
          assert.equal(body.text.includes(BODY_SECRET), false, key);
          assert.equal(body.text.includes(key), false, key);
        }
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('nested prototype-pollution keys are rejected within the inspection bound', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const nestedBodies = [
          '{"kind":"manual_amazon","reason":"Known Amazon purchase evidence","actorId":"helper_1","details":{"__proto__":{"polluted":true}}}',
          '{"kind":"manual_amazon","reason":"Known Amazon purchase evidence","actorId":"helper_1","meta":{"Constructor":{"prototype":{"polluted":true}}}}',
          '{"kind":"manual_amazon","reason":"Known Amazon purchase evidence","actorId":"helper_1","nested":{"prototype":{"x":1}}}',
        ];
        for (const raw of nestedBodies) {
          assert.equal(mutationBodyHasForbiddenFields(JSON.parse(raw)), true, raw);
          const body = await readResponse(
            await postDefault(mod, { env: envFor(baseUrl), body: raw }),
          );
          assert.equal(body.status, 400, raw);
          assert.equal(body.json.error, 'invalid_request');
          assert.equal(body.text.includes('polluted'), false);
          assert.equal(body.text.includes('__proto__'), false);
        }
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('UTF-8 byte limit rejects a multibyte body under 16384 characters', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const payload = `{"notes":"${'é'.repeat(8192)}"}`;
        assert.equal(payload.length <= MAX_MUTATION_BODY_BYTES, true, `chars=${payload.length}`);
        assert.equal(Buffer.byteLength(payload, 'utf8') > MAX_MUTATION_BODY_BYTES, true);
        const body = await readResponse(
          await postDefault(mod, { env: envFor(baseUrl), body: payload }),
        );
        assert.equal(body.status, 400);
        assert.equal(body.json.error, 'invalid_request');
        assert.equal(body.text.includes('é'), false);
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('backend JSON statuses 200/400/403/404/409/500 are preserved', async () => {
      const cases = [
        [200, { ok: true, replay: false }],
        [400, { ok: false, error: 'invalid_request' }],
        [403, { error: 'Forbidden - x-admin-key required in production' }],
        [404, { ok: false, error: 'not_found' }],
        [409, { ok: false, error: 'idempotency_conflict' }],
        [500, { ok: false, error: 'Internal error' }],
      ];
      for (const [status, payload] of cases) {
        const { server, baseUrl } = await startMockBackend((_req, res) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(payload));
        });
        try {
          const body = await readResponse(await postDefault(mod, { env: envFor(baseUrl) }));
          assert.equal(body.status, status);
          assert.deepEqual(body.json, payload);
          assert.equal(body.cacheControl, 'no-store');
          assert.match(body.contentType, /application\/json/);
          assertNoSecret(body.text, `status ${status}`);
        } finally {
          server.close();
        }
      }
    });

    await check('non-JSON timeout unavailable and redirect become generic 502', async () => {
      const htmlBackend = await startMockBackend((_req, res) => {
        res.writeHead(500, { 'content-type': 'text/html' });
        res.end(`<html>stack trace ${FAKE_PII.email} ${ADMIN_KEY}</html>`);
      });
      try {
        const body = await readResponse(await postDefault(mod, { env: envFor(htmlBackend.baseUrl) }));
        assert.equal(body.status, 502);
        assert.equal(body.json.error, 'proxy_unavailable');
        assert.equal(body.text.includes('stack trace'), false);
        assert.equal(body.text.includes('<html>'), false);
        assert.equal(body.cacheControl, 'no-store');
        assertNoSecret(body.text, 'html backend');
      } finally {
        htmlBackend.server.close();
      }

      const unavailable = await readResponse(
        await postDefault(mod, { env: envFor('http://127.0.0.1:1') }),
      );
      assert.equal(unavailable.status, 502);
      assert.equal(unavailable.json.error, 'proxy_unavailable');

      const timeoutErr = new Error('ignored timeout detail');
      timeoutErr.name = 'TimeoutError';
      const timeout = await readResponse(
        await postDefault(mod, {
          env: envFor('http://127.0.0.1:9'),
          fetchImpl: async () => {
            throw timeoutErr;
          },
        }),
      );
      assert.equal(timeout.status, 502);
      assert.equal(timeout.json.error, 'proxy_unavailable');

      const redirectBackend = await startMockBackend((_req, res) => {
        res.writeHead(302, { location: 'http://evil.example/steal' });
        res.end('redirect');
      });
      try {
        const body = await readResponse(await postDefault(mod, { env: envFor(redirectBackend.baseUrl) }));
        assert.equal(body.status, 502);
        assert.equal(body.json.error, 'proxy_unavailable');
        assert.equal(body.text.includes('evil.example'), false);
      } finally {
        redirectBackend.server.close();
      }
    });

    await check('injected error with fake PII and secrets does not leak into response or logs', async () => {
      const logEvents = [];
      const logsBefore = capturedLogs.length;
      const boom = new Error(
        `fetch failed for ${FAKE_PII.email} ${FAKE_PII.phone} ${FAKE_PII.notes} cookie=${FAKE_PII.cookie} admin=${FAKE_PII.adminKey} key=${FAKE_PII.idempotencyKey} token=${FAKE_PII.fulfillmentToken} url=https://evil.example/readers/rp_secret`,
      );
      const body = await readResponse(
        await postDefault(mod, {
          env: envFor('http://127.0.0.1:9'),
          fetchImpl: async () => {
            throw boom;
          },
          log: (e) => logEvents.push(e),
        }),
      );
      assert.equal(body.status, 502);
      assert.deepEqual(body.json, { ok: false, error: 'proxy_unavailable' });
      assertNoSecret(body.text, 'injected error response');
      assert.deepEqual(logEvents, [{ code: 'backend_unavailable' }]);
      const newLogs = capturedLogs.slice(logsBefore).join('\n');
      assertNoSecret(newLogs, 'injected error logs');
      assert.equal(newLogs.includes('rp_secret'), false);
      assert.equal(newLogs.includes('evil.example'), false);
      assert.equal(newLogs.includes('fetch failed'), false);
      assert.match(newLogs, /backend_unavailable/);
    });

    await check('existing GET helper still performs GET-only lifecycle reads', async () => {
      let seen = null;
      const { server, baseUrl } = await startMockBackend((req, res) => {
        seen = collectRequest(req);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, items: [], partial: false, hasMore: false, nextCursor: null, totalCount: null }));
      });
      try {
        const req = new Request('http://agnes-next.local/api/admin/reader-lifecycle/readers', {
          method: 'GET',
          headers: { cookie: SESSION_COOKIE },
        });
        const body = await readResponse(
          await proxyReaderLifecycleGet(req, { route: 'readers' }, { env: envFor(baseUrl) }),
        );
        assert.equal(body.status, 200);
        assert.equal(seen.method, 'GET');
        assert.equal(seen.pathname, '/api/admin/reader-lifecycle/readers');
        assert.equal(seen.headers['x-admin-key'], ADMIN_KEY);
      } finally {
        server.close();
      }
    });

    await check('source audit: no public admin key, no catch-all, no caller-controlled host', () => {
      const implFiles = [
        HELPER_TS,
        ...MUTATION_ROUTE_FILES.map(([rel]) => path.join(LIFECYCLE_DIR, rel)),
      ];
      for (const file of implFiles) {
        const src = fs.readFileSync(file, 'utf8');
        assert.equal(src.includes('NEXT_PUBLIC_ADMIN_KEY'), false, file);
        assert.doesNotMatch(src, /localhost:5055/);
        assert.doesNotMatch(src, /https?:\/\/[a-z0-9.-]*railway/i);
        assert.doesNotMatch(src, /theagnesprotocol\.com/);
        for (const bad of FORBIDDEN_IMPORTS) {
          assert.equal(src.toLowerCase().includes(bad), false, `${file} contains ${bad}`);
        }
      }
      const helper = fs.readFileSync(HELPER_TS, 'utf8');
      const getFn = extractExportedFunction(helper, 'proxyReaderLifecycleGet');
      const postFn = extractExportedFunction(helper, 'proxyReaderLifecyclePost');
      assert.doesNotMatch(helper, /\[\.\.\./);
      assert.match(helper, /x-admin-key': adminKey/);
      assert.match(helper, /FULFILLMENT_ACCESS_TOKEN/);
      assert.match(helper, /timingSafeEqual/);
      assert.doesNotMatch(helper, /headers\.get\(['"]x-admin-key['"]\)/);
      assert.doesNotMatch(helper, /LIFECYCLE_MUTATION_HTTP_METHOD/);
      assert.match(getFn, /method:\s*'GET'/);
      assert.match(postFn, /method:\s*'POST'/);
      assert.doesNotMatch(helper, /method:\s*[a-zA-Z_$]/);
      assert.match(helper, /redirect: 'error'/);
      assert.match(helper, /cache: 'no-store'/);
    });

    await check('mutation helper is absent from client-facing source', () => {
      const clientRoots = [
        path.join(AGNES_NEXT_ROOT, 'src', 'app'),
        path.join(AGNES_NEXT_ROOT, 'src', 'components'),
      ];
      for (const root of clientRoots) {
        for (const file of walkFiles(root)) {
          if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
          if (file.includes(`${path.sep}api${path.sep}`)) continue;
          const src = fs.readFileSync(file, 'utf8');
          assert.equal(src.includes('readerLifecycleAdminProxy'), false, file);
          assert.equal(src.includes('proxyReaderLifecyclePost'), false, file);
          assert.equal(src.includes('NEXT_PUBLIC_ADMIN_KEY'), false, file);
        }
      }
    });

    await check('existing /api/admin/readers proxy files are untouched', () => {
      for (const file of READERS_PROXY_FILES) {
        assert.equal(fs.existsSync(file), true, file);
        assert.equal(gitDiff(file), '', `git diff not empty for ${file}`);
      }
    });

    await check('allowlisted log codes do not include secrets, IDs, bodies, or URLs', () => {
      const blob = capturedLogs.join('\n');
      assertNoSecret(blob, 'captured logs');
      assert.equal(blob.includes('http://127.0.0.1'), false, 'log leaked backend URL');
      assert.equal(blob.includes(DEFAULT_PATH), false, 'log leaked path');
      assert.equal(blob.includes('Known Amazon'), false, 'log leaked body');
      for (const line of capturedLogs) {
        assert.match(line, /\[admin-reader-lifecycle-proxy\]/);
        assert.doesNotMatch(line, /rp_abc123|ev_abc123|ir_abc123/);
      }
    });
  } finally {
    console.error = origError;
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  await check('local Next process: POST reaches mock; other methods 405; GET proxies still work', async () => {
    const mutationHits = [];
    const getHits = [];
    const { server, baseUrl } = await startMockBackend(async (req, res) => {
      const seen = collectRequest(req);
      if (req.method === 'POST') {
        seen.body = await readReqBody(req);
        mutationHits.push(seen);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, replay: false, via: 'mock-post' }));
        return;
      }
      getHits.push(seen);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        items: [],
        partial: false,
        hasMore: false,
        nextCursor: null,
        totalCount: null,
      }));
    });
    const port = await getFreePort();
    const handle = startNextDev({ mockBaseUrl: baseUrl, port });
    try {
      await waitForNextReady(handle);
      const rejectedMethods = ['GET', 'PUT', 'PATCH', 'DELETE'];
      let first = await httpCall({ port, method: 'GET', urlPath: DEFAULT_PATH });
      for (let i = 0; i < 20 && first.status === 404; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        first = await httpCall({ port, method: 'GET', urlPath: DEFAULT_PATH });
      }
      assert.equal(first.status, 405, `GET ${DEFAULT_PATH} after compile`);
      for (const [, urlPath] of MAPPINGS) {
        for (const method of rejectedMethods) {
          if (method === 'GET' && urlPath === DEFAULT_PATH) continue;
          const res = await httpCall({ port, method, urlPath });
          assert.equal(res.status, 405, `${method} ${urlPath}`);
        }
      }
      assert.equal(mutationHits.length, 0, 'rejected methods must not mutate');

      const postBody = JSON.stringify(VALID_BODY);
      const postRes = await httpCall({
        port,
        method: 'POST',
        urlPath: DEFAULT_PATH,
        headers: {
          cookie: SESSION_COOKIE,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(postBody),
          'Idempotency-Key': IDEMPOTENCY_KEY,
          'x-admin-key': 'browser-must-be-ignored',
        },
        body: postBody,
      });
      assert.equal(postRes.status, 200);
      assert.equal(postRes.json.via, 'mock-post');
      assert.equal(mutationHits.length, 1);
      assert.equal(mutationHits[0].pathname, DEFAULT_PATH);
      assert.equal(mutationHits[0].method, 'POST');
      assert.equal(mutationHits[0].headers['x-admin-key'], ADMIN_KEY);
      assert.equal(mutationHits[0].headers.cookie, undefined);
      assert.equal(mutationHits[0].headers['idempotency-key'], IDEMPOTENCY_KEY);

      for (const [, urlPath] of MAPPINGS) {
        const res = await httpCall({
          port,
          method: 'POST',
          urlPath,
          headers: {
            cookie: SESSION_COOKIE,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(postBody),
            'Idempotency-Key': `${IDEMPOTENCY_KEY}-${urlPath.length}`,
          },
          body: postBody,
        });
        assert.equal(res.status, 200, `live POST ${urlPath}`);
      }
      assert.equal(mutationHits.length, 1 + MAPPINGS.length);

      const getRes = await httpCall({
        port,
        method: 'GET',
        urlPath: '/api/admin/reader-lifecycle/readers',
        headers: { cookie: SESSION_COOKIE },
      });
      assert.equal(getRes.status, 200);
      assert.equal(getRes.json.ok, true);
      assert.equal(getRes.json.totalCount, null);
      assert.equal(getHits.length >= 1, true);
      assert.equal(getHits[getHits.length - 1].method, 'GET');
      assert.equal(getHits[getHits.length - 1].pathname, '/api/admin/reader-lifecycle/readers');
      assert.equal(mutationHits.length, 1 + MAPPINGS.length);
    } finally {
      killProcessTree(handle.child.pid);
      server.close();
    }
  });

  const finalDbHash = sha256File(DEV_DB);
  await check('deepquill/dev.db remains byte-for-byte unchanged', () => {
    assert.equal(finalDbHash, CANONICAL_DEV_DB_SHA256);
    assert.equal(finalDbHash, initialDbHash);
  });

  console.log(`\nverify-reader-lifecycle-mutation-proxy: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
