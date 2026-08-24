#!/usr/bin/env node
/**
 * Local GET-only checks for the Reader Manager lifecycle Next.js proxy.
 * Uses a mocked backend on loopback. Never calls production. Never touches databases.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

const ADMIN_KEY = 'checkpoint3c-synthetic-admin-key-not-for-production';
const FULFILLMENT_TOKEN = 'checkpoint3c-synthetic-fulfillment-token';
const SESSION_COOKIE = `fulfillment-token=${FULFILLMENT_TOKEN}`;

const ROUTE_FILES = [
  ['readers/route.ts', { exportTarget: "{ route: 'readers' }" }],
  ['readers/[readerProfileId]/route.ts', { exportTarget: 'readerByProfileId' }],
  ['users/[userId]/route.ts', { exportTarget: 'readerByUserId' }],
  ['review-queue/route.ts', { exportTarget: "{ route: 'reviewQueue' }" }],
  ['communications/route.ts', { exportTarget: "{ route: 'communications' }" }],
  ['purchases-without-profile/route.ts', { exportTarget: "{ route: 'purchasesWithoutProfile' }" }],
];

const MUTATION_ROUTE_FILES = [
  ['readers/[readerProfileId]/evidence/route.ts', 'addEvidence'],
  ['evidence/[evidenceId]/confirm/route.ts', 'confirmEvidence'],
  ['evidence/[evidenceId]/correct/route.ts', 'correctEvidence'],
  ['evidence/[evidenceId]/dispute/route.ts', 'disputeEvidence'],
  ['evidence/[evidenceId]/replace/route.ts', 'replaceEvidence'],
  ['readers/[readerProfileId]/contact-decisions/route.ts', 'addContactDecision'],
  ['readers/[readerProfileId]/identity-reviews/route.ts', 'openIdentityReview'],
  ['identity-reviews/[reviewId]/resolve/route.ts', 'resolveIdentityReview'],
];

const READERS_PROXY_FILES = [
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'readers', 'route.ts'),
  path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'readers', '[id]', 'route.ts'),
];

const FORBIDDEN_IMPORTS = [
  'mailchimp',
  'stripe',
  'nodemailer',
  'referral',
  'backfill',
  '$queryRaw',
  '$executeRaw',
  'prisma',
];

let passed = 0;
let failed = 0;
const logs = [];

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
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agnes-checkpoint3c-'));
  const outFile = path.join(outDir, 'readerLifecycleAdminProxy.mjs');
  fs.writeFileSync(outFile, outputText);
  return { outDir, outFile };
}

async function loadHelper() {
  const { outDir, outFile } = transpileHelper();
  const mod = await import(pathToFileURL(outFile).href);
  return { mod, outDir };
}

function makeRequest(urlPath, { cookie, headers } = {}) {
  const h = new Headers(headers || {});
  if (cookie) h.set('cookie', cookie);
  return new Request(`http://agnes-next.local${urlPath}`, { method: 'GET', headers: h });
}

function startMockBackend(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handler(req, res));
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

async function main() {
  const { mod, outDir } = await loadHelper();
  const {
    proxyReaderLifecycleGet,
    backendPathFor,
    encodePathId,
    resolveBackendBaseUrl,
    FIXED_BACKEND_PATHS,
    BACKEND_NAMESPACE,
    MAX_QUERY_STRING_LENGTH,
  } = mod;

  const capturedLogs = [];
  const origError = console.error;
  console.error = (...args) => {
    capturedLogs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };

  try {
    await check('helper transpiles without Next.js imports', () => {
      const src = fs.readFileSync(HELPER_TS, 'utf8');
      assert.equal(/from ['"]next\//.test(src), false);
    });

    await check('six explicit GET route files exist and export GET only', () => {
      const dir = path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'reader-lifecycle');
      for (const [rel, spec] of ROUTE_FILES) {
        const file = path.join(dir, rel);
        assert.equal(fs.existsSync(file), true, `missing ${rel}`);
        const src = fs.readFileSync(file, 'utf8');
        assert.match(src, /export async function GET/);
        assert.doesNotMatch(src, /export async function (POST|PATCH|PUT|DELETE)/);
        assert.match(src, /proxyReaderLifecycleGet/);
        assert.doesNotMatch(src, /proxyReaderLifecyclePost/);
        assert.doesNotMatch(src, /method:\s*'POST'/);
        if (spec.exportTarget.startsWith('{')) {
          assert.equal(src.includes(spec.exportTarget), true, `${rel} missing ${spec.exportTarget}`);
        } else {
          assert.match(src, new RegExp(spec.exportTarget));
        }
        assert.match(src, /dynamic = 'force-dynamic'/);
      }
      const catchAll = walkFiles(dir).filter((f) => f.includes('[...'));
      assert.equal(catchAll.length, 0, 'catch-all proxy route is not allowed');
    });

    await check('GET helper always issues GET and POST helper always issues POST', () => {
      const helper = fs.readFileSync(HELPER_TS, 'utf8');
      const getFn = extractExportedFunction(helper, 'proxyReaderLifecycleGet');
      const postFn = extractExportedFunction(helper, 'proxyReaderLifecyclePost');
      assert.match(getFn, /method:\s*'GET'/);
      assert.doesNotMatch(getFn, /method:\s*'POST'/);
      assert.doesNotMatch(getFn, /method:\s*[^'"`\s]/);
      assert.match(postFn, /method:\s*'POST'/);
      assert.doesNotMatch(postFn, /method:\s*'GET'/);
      assert.doesNotMatch(postFn, /method:\s*[^'"`\s]/);
      assert.doesNotMatch(helper, /LIFECYCLE_MUTATION_HTTP_METHOD/);
      assert.doesNotMatch(helper, /req\.method/);
      assert.doesNotMatch(helper, /method:\s*[a-zA-Z_$]/);
    });

    await check('mutation route files import and call only the POST helper', () => {
      const dir = path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'reader-lifecycle');
      for (const [rel, routeName] of MUTATION_ROUTE_FILES) {
        const file = path.join(dir, rel);
        assert.equal(fs.existsSync(file), true, `missing ${rel}`);
        const src = fs.readFileSync(file, 'utf8');
        assert.match(src, /export async function POST/);
        assert.doesNotMatch(src, /export async function (GET|PATCH|PUT|DELETE)/);
        assert.match(src, /proxyReaderLifecyclePost/);
        assert.doesNotMatch(src, /proxyReaderLifecycleGet/);
        assert.match(src, new RegExp(`route: '${routeName}'`));
        assert.doesNotMatch(src, /req\.method/);
        assert.doesNotMatch(src, /method:\s*req/);
      }
    });

    await check('unauthenticated request is rejected before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      try {
        const res = await proxyReaderLifecycleGet(makeRequest('/api/admin/reader-lifecycle/readers'), { route: 'readers' }, {
          env: envFor(baseUrl),
          log: (e) => logs.push(e),
        });
        const body = await readResponse(res);
        assert.equal(body.status, 401);
        assert.equal(body.json.error, 'unauthorized');
        assert.equal(body.cacheControl, 'no-store');
        assert.match(body.contentType, /application\/json/);
        assert.equal(backendHits, 0);
        assertNoSecret(body.text, 'unauth response');
      } finally {
        server.close();
      }
    });

    await check('empty cookie is rejected before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const res = await proxyReaderLifecycleGet(
          makeRequest('/api/admin/reader-lifecycle/readers', { cookie: 'fulfillment-token=' }),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 401);
        assert.equal(body.json.error, 'unauthorized');
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('whitespace-only cookie is rejected before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const res = await proxyReaderLifecycleGet(
          makeRequest('/api/admin/reader-lifecycle/readers', { cookie: 'fulfillment-token=   ' }),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 401);
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('wrong same-length cookie is rejected before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const wrong = 'x'.repeat(FULFILLMENT_TOKEN.length);
        const res = await proxyReaderLifecycleGet(
          makeRequest('/api/admin/reader-lifecycle/readers', { cookie: `fulfillment-token=${wrong}` }),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 401);
        assert.equal(body.json.error, 'unauthorized');
        assert.equal(backendHits, 0);
        assertNoSecret(body.text, 'wrong same-length');
      } finally {
        server.close();
      }
    });

    await check('wrong short cookie is rejected before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const res = await proxyReaderLifecycleGet(
          makeRequest('/api/admin/reader-lifecycle/readers', { cookie: 'fulfillment-token=nope' }),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 401);
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('wrong long cookie is rejected before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const res = await proxyReaderLifecycleGet(
          makeRequest('/api/admin/reader-lifecycle/readers', {
            cookie: `fulfillment-token=${FULFILLMENT_TOKEN}-extra`,
          }),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 401);
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('unicode and malformed cookies are rejected without 500', async () => {
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
          const res = await proxyReaderLifecycleGet(
            makeRequest('/api/admin/reader-lifecycle/readers', { cookie }),
            { route: 'readers' },
            { env: envFor(baseUrl) },
          );
          const body = await readResponse(res);
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

    await check('unrelated cookie name is rejected before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const res = await proxyReaderLifecycleGet(
          makeRequest('/api/admin/reader-lifecycle/readers', { cookie: 'other=abc' }),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        assert.equal((await readResponse(res)).status, 401);
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('authenticated request sends server-side x-admin-key only', async () => {
      let seen = null;
      const { server, baseUrl } = await startMockBackend((req, res) => {
        seen = collectRequest(req);
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
      try {
        const res = await proxyReaderLifecycleGet(
          makeRequest('/api/admin/reader-lifecycle/readers?pageSize=50', {
            cookie: SESSION_COOKIE,
            headers: { 'x-admin-key': 'client-supplied-key-must-be-ignored' },
          }),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 200);
        assert.equal(seen.method, 'GET');
        assert.equal(seen.pathname, '/api/admin/reader-lifecycle/readers');
        assert.equal(seen.headers['x-admin-key'], ADMIN_KEY);
        assert.equal(seen.headers.cookie, undefined);
        assert.equal(body.json.totalCount, null);
        assert.equal(body.json.partial, false);
        assert.equal(body.json.hasMore, false);
        assert.equal(body.json.nextCursor, null);
        assert.equal(body.cacheControl, 'no-store');
        assert.match(body.contentType, /application\/json/);
        assertNoSecret(body.text, 'success response');
      } finally {
        server.close();
      }
    });

    await check('each of six GET operations maps to the exact fixed backend route', async () => {
      const hits = [];
      const { server, baseUrl } = await startMockBackend((req, res) => {
        hits.push(collectRequest(req));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, items: [], partial: false, hasMore: false, nextCursor: null, totalCount: null }));
      });
      try {
        const cases = [
          [{ route: 'readers' }, '/api/admin/reader-lifecycle/readers', '/api/admin/reader-lifecycle/readers'],
          [{ route: 'readerByProfileId', readerProfileId: 'rp_abc123' }, '/api/admin/reader-lifecycle/readers/rp_abc123', '/api/admin/reader-lifecycle/readers/rp_abc123'],
          [{ route: 'readerByUserId', userId: 'user_abc123' }, '/api/admin/reader-lifecycle/users/user_abc123', '/api/admin/reader-lifecycle/users/user_abc123'],
          [{ route: 'reviewQueue' }, '/api/admin/reader-lifecycle/review-queue', '/api/admin/reader-lifecycle/review-queue'],
          [{ route: 'communications' }, '/api/admin/reader-lifecycle/communications', '/api/admin/reader-lifecycle/communications'],
          [{ route: 'purchasesWithoutProfile' }, '/api/admin/reader-lifecycle/purchases-without-profile', '/api/admin/reader-lifecycle/purchases-without-profile'],
        ];
        for (const [target, reqPath, expected] of cases) {
          const res = await proxyReaderLifecycleGet(
            makeRequest(reqPath, { cookie: SESSION_COOKIE }),
            target,
            { env: envFor(baseUrl) },
          );
          assert.equal((await readResponse(res)).status, 200);
          assert.equal(hits[hits.length - 1].pathname, expected);
          assert.equal(hits[hits.length - 1].method, 'GET');
        }
        assert.equal(hits.length, 6);
      } finally {
        server.close();
      }
    });

    await check('query parameters and opaque cursor pass through unchanged', async () => {
      let seen = null;
      const { server, baseUrl } = await startMockBackend((req, res) => {
        seen = collectRequest(req);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, nextCursor: 'opaque', hasMore: true, totalCount: null }));
      });
      try {
        const cursor = 'eyJ0IjoiY3JlYXRlZEF0IiwidiI6IjIwMjYtMDEtMDEifQ';
        const qs = `?pageSize=50&cursor=${cursor}&q=hello%20world&status=all`;
        const res = await proxyReaderLifecycleGet(
          makeRequest(`/api/admin/reader-lifecycle/readers${qs}`, { cookie: SESSION_COOKIE }),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 200);
        assert.equal(seen.search, qs);
        assert.equal(body.json.nextCursor, 'opaque');
        assert.equal(body.json.totalCount, null);
        assert.equal(body.json.hasMore, true);
      } finally {
        server.close();
      }
    });

    await check('dynamic IDs are safely encoded', () => {
      assert.equal(encodePathId('rp_plus+id'), 'rp_plus%2Bid');
      assert.equal(backendPathFor({ route: 'readerByProfileId', readerProfileId: 'rp_plus+id' }), `${FIXED_BACKEND_PATHS.readers}/rp_plus%2Bid`);
      assert.equal(backendPathFor({ route: 'readerByUserId', userId: 'user_1' }), `${BACKEND_NAMESPACE}/users/user_1`);
    });

    await check('path injection cannot change the fixed backend route', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const injections = ['../users/evil', '../../secret', 'a/b', 'a\\b', 'foo?x=1', 'foo#hash', '..', '.', 'x/../y'];
        for (const readerProfileId of injections) {
          const res = await proxyReaderLifecycleGet(
            makeRequest(`/api/admin/reader-lifecycle/readers/${encodeURIComponent(readerProfileId)}`, { cookie: SESSION_COOKIE }),
            { route: 'readerByProfileId', readerProfileId },
            { env: envFor(baseUrl) },
          );
          const body = await readResponse(res);
          assert.equal(body.status, 400, readerProfileId);
          assert.equal(body.json.error, 'invalid_request');
          assert.equal(body.cacheControl, 'no-store');
        }
        assert.equal(backendHits, 0);
        assert.equal(backendPathFor({ route: 'readerByProfileId', readerProfileId: '../users/evil' }), null);
      } finally {
        server.close();
      }
    });

    await check('oversized query string is rejected before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const qs = `?cursor=${'a'.repeat(MAX_QUERY_STRING_LENGTH)}`;
        const res = await proxyReaderLifecycleGet(
          makeRequest(`/api/admin/reader-lifecycle/readers${qs}`, { cookie: SESSION_COOKIE }),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 400);
        assert.equal(body.json.error, 'invalid_request');
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('backend 400/403/404 statuses and JSON bodies are preserved', async () => {
      const cases = [
        [400, { error: 'Invalid pageSize' }],
        [403, { error: 'Forbidden - x-admin-key required in production' }],
        [404, { error: 'Not found' }],
      ];
      for (const [status, payload] of cases) {
        const { server, baseUrl } = await startMockBackend((_req, res) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(payload));
        });
        try {
          const res = await proxyReaderLifecycleGet(
            makeRequest('/api/admin/reader-lifecycle/readers', { cookie: SESSION_COOKIE }),
            { route: 'readers' },
            { env: envFor(baseUrl) },
          );
          const body = await readResponse(res);
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

    await check('backend 500 JSON is preserved without leaking the admin key', async () => {
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal error' }));
      });
      try {
        const res = await proxyReaderLifecycleGet(
          makeRequest('/api/admin/reader-lifecycle/readers', { cookie: SESSION_COOKIE }),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 500);
        assert.deepEqual(body.json, { error: 'Internal error' });
        assertNoSecret(body.text, 'backend 500');
        assert.equal(body.cacheControl, 'no-store');
      } finally {
        server.close();
      }
    });

    await check('backend unavailable and non-JSON are generic 502', async () => {
      const htmlBackend = await startMockBackend((_req, res) => {
        res.writeHead(500, { 'content-type': 'text/html' });
        res.end('<html>stack trace ADMIN should not leak</html>');
      });
      try {
        const res = await proxyReaderLifecycleGet(
          makeRequest('/api/admin/reader-lifecycle/readers', { cookie: SESSION_COOKIE }),
          { route: 'readers' },
          { env: envFor(htmlBackend.baseUrl) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 502);
        assert.equal(body.json.error, 'proxy_unavailable');
        assert.equal(body.text.includes('stack trace'), false);
        assert.equal(body.text.includes('<html>'), false);
        assert.equal(body.cacheControl, 'no-store');
      } finally {
        htmlBackend.server.close();
      }

      const res = await proxyReaderLifecycleGet(
        makeRequest('/api/admin/reader-lifecycle/readers', { cookie: SESSION_COOKIE }),
        { route: 'readers' },
        { env: envFor('http://127.0.0.1:1') },
      );
      const body = await readResponse(res);
      assert.equal(body.status, 502);
      assert.equal(body.json.error, 'proxy_unavailable');
      assert.equal(body.cacheControl, 'no-store');
      assertNoSecret(body.text, 'unavailable');
    });

    await check('missing FULFILLMENT_ACCESS_TOKEN fails closed before backend call', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const res = await proxyReaderLifecycleGet(
          makeRequest('/api/admin/reader-lifecycle/readers', { cookie: SESSION_COOKIE }),
          { route: 'readers' },
          { env: envFor(baseUrl, { FULFILLMENT_ACCESS_TOKEN: '' }) },
        );
        const body = await readResponse(res);
        assert.equal(body.status, 500);
        assert.equal(body.json.error, 'admin_not_configured');
        assert.equal(body.text.includes('FULFILLMENT_ACCESS_TOKEN'), false);
        assert.equal(body.cacheControl, 'no-store');
        assert.equal(backendHits, 0);
        assertNoSecret(body.text, 'missing fulfillment token config');
      } finally {
        server.close();
      }
    });

    await check('missing backend URL or admin key fail closed without reaching backend', async () => {
      let backendHits = 0;
      const { server, baseUrl } = await startMockBackend((_req, res) => {
        backendHits += 1;
        res.end('{}');
      });
      try {
        const noKey = await readResponse(
          await proxyReaderLifecycleGet(
            makeRequest('/api/admin/reader-lifecycle/readers', { cookie: SESSION_COOKIE }),
            { route: 'readers' },
            { env: envFor(baseUrl, { ADMIN_KEY: '' }) },
          ),
        );
        assert.equal(noKey.status, 500);
        assert.equal(noKey.json.error, 'admin_not_configured');
        assert.equal(noKey.text.includes('DEEPQUILL_URL'), false);
        assert.equal(noKey.text.includes('ADMIN_KEY'), false);

        const noUrl = await readResponse(
          await proxyReaderLifecycleGet(
            makeRequest('/api/admin/reader-lifecycle/readers', { cookie: SESSION_COOKIE }),
            { route: 'readers' },
            { env: { ADMIN_KEY, FULFILLMENT_ACCESS_TOKEN: FULFILLMENT_TOKEN } },
          ),
        );
        assert.equal(noUrl.status, 500);
        assert.equal(noUrl.json.error, 'admin_not_configured');
        assert.equal(backendHits, 0);
      } finally {
        server.close();
      }
    });

    await check('trailing slashes are stripped from the backend base URL', () => {
      assert.equal(resolveBackendBaseUrl({ DEEPQUILL_URL: 'http://127.0.0.1:9999///' }), 'http://127.0.0.1:9999');
      assert.equal(resolveBackendBaseUrl({}), null);
      assert.equal(resolveBackendBaseUrl({ DEEPQUILL_URL: 'file:///tmp/x' }), null);
    });

    await check('helper fetch is GET-only and ignores caller-supplied backend URL/admin key', async () => {
      let seen = null;
      const { server, baseUrl } = await startMockBackend((req, res) => {
        seen = collectRequest(req);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      try {
        const res = await proxyReaderLifecycleGet(
          makeRequest(
            '/api/admin/reader-lifecycle/readers?url=http://evil.example&backend=http://evil.example',
            {
              cookie: SESSION_COOKIE,
              headers: { 'x-admin-key': 'from-browser', host: 'evil.example' },
            },
          ),
          { route: 'readers' },
          { env: envFor(baseUrl) },
        );
        assert.equal((await readResponse(res)).status, 200);
        assert.equal(seen.pathname, '/api/admin/reader-lifecycle/readers');
        assert.equal(new URL(seen.url, baseUrl).host, `127.0.0.1:${server.address().port}`);
        assert.equal(seen.headers['x-admin-key'], ADMIN_KEY);
        assert.equal(seen.method, 'GET');
      } finally {
        server.close();
      }
    });

    await check('admin key never appears in captured logs', () => {
      const blob = capturedLogs.join('\n') + JSON.stringify(logs);
      assertNoSecret(blob, 'logs');
      for (const line of capturedLogs) {
        assert.equal(line.includes('http://127.0.0.1'), false, 'log leaked backend URL');
        assert.equal(line.includes('cursor='), false, 'log leaked query');
        assert.equal(line.includes('@'), false, 'log may contain email');
      }
    });

    await check('source audit: no public admin key, no catch-all, no caller-controlled host or method', () => {
      const implFiles = [
        HELPER_TS,
        ...ROUTE_FILES.map(([rel]) => path.join(AGNES_NEXT_ROOT, 'src', 'app', 'api', 'admin', 'reader-lifecycle', rel)),
      ];
      for (const file of implFiles) {
        const src = fs.readFileSync(file, 'utf8');
        assert.equal(src.includes('NEXT_PUBLIC_ADMIN_KEY'), false, file);
        assert.doesNotMatch(src, /localhost:5055/);
        assert.doesNotMatch(src, /https?:\/\/[a-z0-9.-]*railway/i);
        for (const bad of FORBIDDEN_IMPORTS) {
          assert.equal(src.toLowerCase().includes(bad), false, `${file} contains ${bad}`);
        }
      }
      const helper = fs.readFileSync(HELPER_TS, 'utf8');
      const getFn = extractExportedFunction(helper, 'proxyReaderLifecycleGet');
      const postFn = extractExportedFunction(helper, 'proxyReaderLifecyclePost');
      assert.match(getFn, /method:\s*'GET'/);
      assert.match(postFn, /method:\s*'POST'/);
      assert.doesNotMatch(helper, /\[\.\.\./);
      assert.match(helper, /x-admin-key': adminKey/);
      assert.match(helper, /FULFILLMENT_ACCESS_TOKEN/);
      assert.match(helper, /timingSafeEqual/);
      assert.doesNotMatch(helper, /headers\.get\(['"]x-admin-key['"]\)/);
      assert.doesNotMatch(helper, /LIFECYCLE_MUTATION_HTTP_METHOD/);
    });

    await check('admin key is absent from client-facing source', () => {
      const clientRoots = [
        path.join(AGNES_NEXT_ROOT, 'src', 'app'),
        path.join(AGNES_NEXT_ROOT, 'src', 'components'),
      ];
      for (const root of clientRoots) {
        if (!fs.existsSync(root)) continue;
        for (const file of walkFiles(root)) {
          if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
          if (file.includes(`${path.sep}api${path.sep}`)) continue;
          const src = fs.readFileSync(file, 'utf8');
          assert.equal(src.includes('readerLifecycleAdminProxy'), false, file);
          assert.equal(src.includes('proxyReaderLifecycleGet'), false, file);
          assert.equal(src.includes('proxyReaderLifecyclePost'), false, file);
          assert.equal(src.includes('NEXT_PUBLIC_ADMIN_KEY'), false, file);
        }
      }
    });

    await check('existing /api/admin/readers proxy files are untouched', () => {
      for (const file of READERS_PROXY_FILES) {
        assert.equal(fs.existsSync(file), true, file);
        assert.equal(gitDiff(file), '', `git diff not empty for ${file}`);
        const src = fs.readFileSync(file, 'utf8');
        assert.match(src, /export async function GET/);
        assert.match(src, /\/api\/admin\/readers/);
        assert.match(src, /fulfillment-token/);
      }
    });

    await check('no localhost default and DEEPQUILL_URL is preferred', () => {
      assert.equal(
        resolveBackendBaseUrl({
          DEEPQUILL_URL: 'http://127.0.0.1:7777',
          NEXT_PUBLIC_API_BASE_URL: 'http://example.invalid',
        }),
        'http://127.0.0.1:7777',
      );
      assert.equal(
        resolveBackendBaseUrl({ NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:8888/' }),
        'http://127.0.0.1:8888',
      );
    });
  } finally {
    console.error = origError;
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  console.log(`\nverify-reader-lifecycle-proxy: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
