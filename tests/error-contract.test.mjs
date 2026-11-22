import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { migrateLocal } from '../scripts/local-migrations.mjs';
import cloudflareEntry from '../server/cloudflare-entry.mjs';

const ARABIC_RE = /[\u0600-\u06FF]/;
const TEST_ENV = {
  AUTH_JWT_SECRET: 'error-contract-test-secret-key-256-bits',
  AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
  AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm',
  RATE_LIMIT_PER_MINUTE: '100',
  OAUTH_GOOGLE_CLIENT_IDS: 'curafit-android-client-id',
};

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createTestOidcSigner(kid = 'err-contract-k1') {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  pubJwk.kid = kid;
  pubJwk.use = 'sig';
  pubJwk.alg = 'RS256';
  const signJwt = async payload => {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const body = b64url(JSON.stringify(payload));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${header}.${body}`));
    return `${header}.${body}.${b64url(sig)}`;
  };
  return { jwksJson: JSON.stringify({ keys: [pubJwk] }), signJwt };
}

test('KMM Error Contract: pure English error catalog, source audit, and live HTTP envelopes', async t => {
  const catalogRaw = await readFile('contracts/error-codes.json', 'utf8');
  const docsRaw = await readFile('docs/ERROR_CODES.md', 'utf8');
  const catalog = JSON.parse(catalogRaw);

  await t.test('all documentation, contracts, examples, and Postman files contain zero Arabic characters', async () => {
    const walkMd = async dir => {
      const results = [];
      for (const ent of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) results.push(...(await walkMd(full)));
        else if (ent.name.endsWith('.md')) results.push(full);
      }
      return results;
    };
    const docFiles = [
      ...(await walkMd('docs')),
      ...(await walkMd('postman')),
      'README.md',
      'AGENTS.md',
      'contracts/openapi.yaml',
      'contracts/error-codes.json',
      'contracts/coaching-codes.json',
      ...(await readdir('contracts/examples')).map(f => join('contracts/examples', f)),
      ...(await readdir('postman')).filter(f => f.endsWith('.json')).map(f => join('postman', f)),
    ];
    assert.ok(docFiles.length >= 40, `Expected at least 40 doc/contract/Postman files, got ${docFiles.length}`);
    for (const file of docFiles) {
      const text = await readFile(file, 'utf8');
      assert.ok(!ARABIC_RE.test(text), `Documentation/contract file must not contain Arabic text: ${file}`);
    }
  });

  await t.test('contracts/error-codes.json, contracts/coaching-codes.json, and generated docs contain zero Arabic characters', async () => {
    assert.ok(!ARABIC_RE.test(catalogRaw), 'contracts/error-codes.json must not contain Arabic text');
    assert.ok(!ARABIC_RE.test(docsRaw), 'docs/ERROR_CODES.md must not contain Arabic text');
    assert.equal(catalog.fieldLabelsAr, undefined, 'contracts/error-codes.json must not include fieldLabelsAr');
    for (const [code, def] of Object.entries(catalog.codes)) {
      assert.match(code, /^[A-Z][A-Z0-9_]+$/);
      assert.equal(def.ar, undefined, `Error code ${code} must not store Arabic translations in the API contract`);
      assert.ok(typeof def.message === 'string' && def.message.length > 0);
      assert.ok(Number.isInteger(def.httpStatus) && def.httpStatus >= 400 && def.httpStatus <= 599);
      assert.ok(docsRaw.includes(`\`${code}\``), `docs/ERROR_CODES.md missing code ${code}`);
    }
    const coachingRaw = await readFile('contracts/coaching-codes.json', 'utf8');
    const coachingDocsRaw = await readFile('docs/COACHING_CODES.md', 'utf8');
    assert.ok(!ARABIC_RE.test(coachingRaw), 'contracts/coaching-codes.json must not contain Arabic text');
    assert.ok(!ARABIC_RE.test(coachingDocsRaw), 'docs/COACHING_CODES.md must not contain Arabic text');
    const coachingCatalog = JSON.parse(coachingRaw);
    for (const [code, def] of Object.entries(coachingCatalog.codes)) {
      assert.match(code, /^[A-Z][A-Z0-9_]+$/);
      assert.ok(typeof def.message === 'string' && def.message.length > 0);
      assert.ok(coachingDocsRaw.includes(`\`${code}\``), `docs/COACHING_CODES.md missing code ${code}`);
    }
  });

  await t.test('all server & engine error calls use cataloged codes and zero Arabic characters', async () => {
    const serverFiles = (await readdir('server')).filter(f => f.endsWith('.mjs')).map(f => resolve('server', f));
    const sharedFiles = [
      'coaching-error.mjs',
      'coaching-shared.mjs',
      'coaching-journey.mjs',
      'core.mjs',
      'portions.mjs',
      'pantry.mjs',
      'meal-components.mjs',
      'sports.mjs',
      'diet-patterns.mjs',
      'planner-core.mjs',
      'workout-engine.mjs',
    ].map(f => resolve(f));

    for (const file of [...serverFiles, ...sharedFiles]) {
      const content = await readFile(file, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (/\b(?:apiError|createApiError|errorJson|planCoverageError|fail)\s*\(/.test(line) || /\bthrow\s+(?:new\s+)?Error\s*\(/.test(line)) {
          assert.ok(!ARABIC_RE.test(line), `Arabic text in error statement at ${file}:${idx + 1}: ${line}`);
        }
        const codeMatch = line.match(/(?:apiError|fail)\(\s*['"]([A-Z][A-Z0-9_]+)['"]/);
        if (codeMatch) {
          assert.ok(Object.hasOwn(catalog.codes, codeMatch[1]), `Uncatalogued error code ${codeMatch[1]} in ${file}:${idx + 1}`);
        }
        const optCodeMatch = line.match(/\bcode:\s*['"]([A-Z][A-Z0-9_]+)['"]/);
        if (optCodeMatch && !['AGE_UNSUPPORTED_OR_MISSING', 'SENIOR_REQUIRES_REVIEW'].includes(optCodeMatch[1])) {
          // Ignore 200 OK eligibility reasonCodes / review reasonCodes by checking error context
          if (/apiError|createApiError|errorJson|throw /.test(line) || lines.slice(Math.max(0, idx - 3), idx + 1).some(l => /apiError|createApiError|errorJson/.test(l))) {
            assert.ok(Object.hasOwn(catalog.codes, optCodeMatch[1]), `Uncatalogued error code ${optCodeMatch[1]} in ${file}:${idx + 1}`);
          }
        }
      });
    }
  });

  await t.test('live HTTP responses conform to uniform { ok, data, error, meta } envelope and zero Arabic in errors', async () => {
    const mf = new Miniflare({
      modules: true,
      scriptPath: 'dist/server/index.js',
      compatibilityDate: '2025-10-11',
      compatibilityFlags: ['nodejs_als'],
      d1Databases: ['DB'],
      bindings: { ...TEST_ENV, RATE_LIMIT_PER_MINUTE: '4' },
    });

    try {
      const db = await mf.getD1Database('DB');
      await migrateLocal(db);
      const googleSigner = await createTestOidcSigner('err-google-k1');

      const call = async (path, opts = {}, envExtra = {}) => {
        const env = { ...TEST_ENV, OAUTH_GOOGLE_JWKS_JSON: googleSigner.jwksJson, ...envExtra, DB: db };
        const req = new Request('https://curafit-api.egypt-nutrition-coach.workers.dev/v1/' + path, opts);
        return await cloudflareEntry.fetch(req, env, { waitUntil() {} });
      };

      const assertSuccess = async (res, expectedStatus) => {
        assert.equal(res.status, expectedStatus);
        const body = await res.json();
        assert.equal(body.ok, true);
        assert.ok(body.meta?.requestId);
        assert.ok(body.meta?.serverTime);
        assert.equal(body.error, undefined);
        return body.data;
      };

      const assertErr = async (res, expectedStatus, expectedCode) => {
        assert.equal(res.status, expectedStatus);
        const body = await res.json();
        assert.equal(body.ok, false);
        assert.equal(body.data, undefined);
        assert.ok(body.meta?.requestId);
        assert.ok(body.meta?.serverTime);
        assert.ok(body.error);
        assert.equal(body.error.code, expectedCode);
        assert.ok(Object.hasOwn(catalog.codes, body.error.code), `Returned code ${body.error.code} missing from catalog`);
        assert.ok(typeof body.error.message === 'string' && body.error.message.length > 0);
        assert.ok(!ARABIC_RE.test(JSON.stringify(body.error)), `Error response leaked Arabic: ${JSON.stringify(body.error)}`);
        assert.equal(typeof body.error.params, 'object');
        assert.ok(Array.isArray(body.error.fieldErrors));
        assert.equal(typeof body.error.retryable, 'boolean');
        return body.error;
      };

      // 200 GET /v1/health & /v1/capabilities (simulation_90d removed)
      const health = await assertSuccess(await call('health'), 200);
      assert.equal(health.status, 'ok');
      const caps = await assertSuccess(await call('capabilities'), 200);
      assert.ok(!caps.features.includes('simulation_90d'));

      // 405 Method Not Allowed
      await assertErr(await call('health', { method: 'POST' }), 405, 'METHOD_NOT_ALLOWED');

      // 401 Unauthenticated (raw worker without web cookie adapter), invalid Bearer tokens, & missing OIDC token
      await assertErr(await mf.dispatchFetch('https://curafit-api.egypt-nutrition-coach.workers.dev/v1/state'), 401, 'UNAUTHENTICATED');
      await assertErr(await call('state', { headers: { Authorization: 'Basic abc' } }), 401, 'AUTH_HEADER_INVALID');
      await assertErr(await call('state', { headers: { Authorization: 'Bearer bad' } }), 401, 'AUTH_TOKEN_MALFORMED');
      await assertErr(
        await call('auth/oauth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: '' }),
        }),
        401,
        'AUTH_OAUTH_TOKEN_INVALID'
      );

      // 201 Google OIDC Sign-In
      const nowSec = Math.floor(Date.now() / 1000);
      const googleJwt = await googleSigner.signJwt({
        iss: 'https://accounts.google.com',
        aud: 'curafit-android-client-id',
        sub: 'google-sub-error-contract-01',
        email: 'contract@curafit.app',
        email_verified: true,
        iat: nowSec,
        exp: nowSec + 3600,
      });
      const regData = await assertSuccess(
        await call('auth/oauth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: googleJwt }),
        }),
        201
      );
      const authHeaders = { Authorization: `Bearer ${regData.accessToken}`, 'Content-Type': 'application/json' };

      // 403 Cross-origin write forbidden
      await assertErr(
        await call('commands', {
          method: 'POST',
          headers: { ...authHeaders, Origin: 'https://evil.example', 'Idempotency-Key': 'k1' },
          body: JSON.stringify({ revision: 0, action: 'weight', payload: { kg: 80 } }),
        }),
        403,
        'ORIGIN_FORBIDDEN'
      );

      // 404 Exercise Not Found
      await assertErr(await call('exercises/nonexistent-exercise-999', { headers: authHeaders }), 404, 'EXERCISE_NOT_FOUND');

      // 404 Route Not Found (write method/path unknown)
      await assertErr(
        await call('unknown/route', { method: 'POST', headers: authHeaders, body: '{}' }),
        404,
        'ROUTE_NOT_FOUND'
      );

      // 415 Unsupported Media Type
      await assertErr(
        await call('commands', {
          method: 'POST',
          headers: { Authorization: `Bearer ${regData.accessToken}`, 'Content-Type': 'text/plain', 'Idempotency-Key': 'k2' },
          body: '{}',
        }),
        415,
        'UNSUPPORTED_MEDIA_TYPE'
      );

      // 400 Invalid JSON
      await assertErr(
        await call('commands', {
          method: 'POST',
          headers: { ...authHeaders, 'Idempotency-Key': 'k3' },
          body: '{broken-json',
        }),
        400,
        'INVALID_JSON'
      );

      // 413 Payload Too Large
      await assertErr(
        await call('commands', {
          method: 'POST',
          headers: { ...authHeaders, 'Idempotency-Key': 'k4' },
          body: JSON.stringify({ revision: 0, action: 'generate', payload: { name: 'a'.repeat(45000) } }),
        }),
        413,
        'PAYLOAD_TOO_LARGE'
      );

      // 400 Field validation (`NUMBER_OUT_OF_RANGE`)
      const valErr = await assertErr(
        await call('commands', {
          method: 'POST',
          headers: { ...authHeaders, 'Idempotency-Key': 'k5' },
          body: JSON.stringify({
            revision: 0,
            action: 'generate',
            payload: { name: 'Test', age: 10, weight: 80, height: 175, sex: 'male', goal: 'lose', serviceTrack: 'workouts_only', healthConfirmed: true },
          }),
        }),
        400,
        'NUMBER_OUT_OF_RANGE'
      );
      assert.equal(valErr.params.field, 'age');
      assert.equal(valErr.fieldErrors[0]?.field, 'age');

      // 409 Revision conflict with structured params & mergeHints
      const conflictErr = await assertErr(
        await call('commands', {
          method: 'POST',
          headers: { ...authHeaders, 'Idempotency-Key': 'k6' },
          body: JSON.stringify({ revision: 9, action: 'weight', payload: { kg: 80 } }),
        }),
        409,
        'REVISION_CONFLICT'
      );
      assert.equal(conflictErr.params.expectedRevision, 9);
      assert.equal(conflictErr.params.currentRevision, 0);
      assert.equal(conflictErr.details?.currentRevision, 0);
      assert.ok(conflictErr.details?.mergeHints?.syncChangesEndpoint);

      // 429 Rate Limited (limit is 2 reads/min when overridden)
      let rateRes;
      for (let i = 0; i < 4; i++) {
        rateRes = await call('state', { headers: { Authorization: `Bearer ${regData.accessToken}` } }, { RATE_LIMIT_PER_MINUTE: '2' });
        if (rateRes.status === 429) break;
      }
      await assertErr(rateRes, 429, 'RATE_LIMITED');
    } finally {
      await mf.dispose();
    }
  });
});
