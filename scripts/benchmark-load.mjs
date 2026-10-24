// Synthetic Performance & Payload Benchmark Suite (Milestone G)
// Measures payload reduction (before vs after), food search latency, and D1 command/read p50/p95/p99 latencies.

import zlib from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { migrateLocal } from './local-migrations.mjs';
import { signHs256Jwt } from '../server/auth.mjs';
import { searchFoodCatalog } from '../server/food-catalog.mjs';

const SECRET = 'bench-secret-key-256-bit-minimum-for-local-profiling';

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
  return Math.round(sortedArr[idx] * 100) / 100;
}

const mf = new Miniflare({
  modules: true,
  scriptPath: 'dist/server/index.js',
  compatibilityDate: '2025-10-11',
  compatibilityFlags: ['nodejs_als'],
  d1Databases: ['DB'],
  bindings: {
    AUTH_JWT_SECRET: SECRET,
    AUTH_ISSUER: 'https://auth.egypt-nutrition-coach.local',
    AUTH_AUDIENCE: 'egypt-nutrition-coach-kmm',
    RATE_LIMIT_PER_MINUTE: '5000'
  }
});

try {
  const db = await mf.getD1Database('DB');
  await migrateLocal(db);

  const nowSec = Math.floor(Date.now() / 1000);
  const token = await signHs256Jwt({
    iss: 'https://auth.egypt-nutrition-coach.local',
    aud: 'egypt-nutrition-coach-kmm',
    sub: 'bench-user-1',
    sid: 'bench-sess-1',
    iat: nowSec - 10,
    exp: nowSec + 3600
  }, SECRET);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const req = (path, opts = {}) => mf.dispatchFetch('https://bench.local/v1/' + path, opts);

  // 1. Generate full plan and measure legacy full-state response vs new KMM bootstrap & delta receipt
  const genRes = await req('commands', {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': 'bench-gen' },
    body: JSON.stringify({
      revision: 0,
      action: 'generate',
      payload: { name: 'Bench', age: 30, weight: 80, height: 175, sex: 'male', goal: 'lose', serviceTrack: 'nutrition_and_workouts', dietType: 'balanced', selectedWorkoutDays: [1, 3, 5], mealsCount: 4 }
    })
  });
  const fullStateText = await genRes.text();
  const fullStateRawBytes = Buffer.byteLength(fullStateText, 'utf8');
  const fullStateGzipBytes = zlib.gzipSync(fullStateText).length;

  const bootRes = await req('bootstrap', { headers });
  const bootText = await bootRes.text();
  const bootRawBytes = Buffer.byteLength(bootText, 'utf8');
  const bootGzipBytes = zlib.gzipSync(bootText).length;

  const waterReceiptRes = await req('commands?view=receipt', {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': 'bench-water-1' },
    body: JSON.stringify({ revision: 1, action: 'water', payload: { addCups: 1 } })
  });
  const waterReceiptText = await waterReceiptRes.text();
  const waterReceiptRawBytes = Buffer.byteLength(waterReceiptText, 'utf8');
  const waterReceiptGzipBytes = zlib.gzipSync(waterReceiptText).length;

  // 2. Measure Arabic Food Search latency across 50 queries
  const queries = ['فول', 'فول مدمس', 'طعمية', 'فلافل', 'كشري', 'ملوخية', 'محشي', 'عيش بلدي', 'رز', 'كنافة', 'شاي بسكر', 'قهوة بلبن', 'عصير مانجا'];
  const searchLatencies = [];
  for (let i = 0; i < 50; i++) {
    const q = queries[i % queries.length];
    const t0 = performance.now();
    searchFoodCatalog({ q, limit: 20 });
    searchLatencies.push(performance.now() - t0);
  }
  searchLatencies.sort((a, b) => a - b);

  // 3. Measure HTTP /v1/bootstrap read latency (50 requests)
  const bootstrapLatencies = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    const r = await req('bootstrap', { headers });
    await r.text();
    bootstrapLatencies.push(performance.now() - t0);
  }
  bootstrapLatencies.sort((a, b) => a - b);

  // 4. Measure HTTP POST /v1/commands?view=receipt write latency (30 sequential water/weight/diary writes)
  const writeLatencies = [];
  let rev = 2;
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    const r = await req('commands?view=receipt', {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': `bench-write-${i}` },
      body: JSON.stringify({ revision: rev++, action: 'water', payload: { cups: (i % 12) + 1 } })
    });
    await r.text();
    writeLatencies.push(performance.now() - t0);
  }
  writeLatencies.sort((a, b) => a - b);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      sqliteVersion: '3.40.1'
    },
    payloadComparison: {
      legacyFullStateResponse: { rawBytes: fullStateRawBytes, gzipBytes: fullStateGzipBytes },
      kmmBootstrapResponse: { rawBytes: bootRawBytes, gzipBytes: bootGzipBytes, reductionPct: Math.round((1 - bootRawBytes / fullStateRawBytes) * 10000) / 100 },
      kmmWaterLogReceiptResponse: { rawBytes: waterReceiptRawBytes, gzipBytes: waterReceiptGzipBytes, reductionPct: Math.round((1 - waterReceiptRawBytes / fullStateRawBytes) * 10000) / 100 }
    },
    latenciesMs: {
      arabicFoodCatalogSearchInMemory: {
        samples: searchLatencies.length,
        p50: percentile(searchLatencies, 50),
        p95: percentile(searchLatencies, 95),
        p99: percentile(searchLatencies, 99)
      },
      httpBootstrapReadD1: {
        samples: bootstrapLatencies.length,
        p50: percentile(bootstrapLatencies, 50),
        p95: percentile(bootstrapLatencies, 95),
        p99: percentile(bootstrapLatencies, 99)
      },
      httpCommandReceiptWriteD1: {
        samples: writeLatencies.length,
        p50: percentile(writeLatencies, 50),
        p95: percentile(writeLatencies, 95),
        p99: percentile(writeLatencies, 99)
      }
    }
  };

  await mkdir('outputs', { recursive: true });
  await writeFile('outputs/benchmark-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await mf.dispose();
}
