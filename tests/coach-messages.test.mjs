import test from 'node:test';
import assert from 'node:assert/strict';
import { NUTRITION, TRAINING, MOTIVATION, SORENESS, SORENESS_PRE, TIPS, dailyTips, seedPick } from '../coach-messages.mjs';

const ctx = { diff: 0.6, kg: 79.4, cups: 4, target: 12, liters: 3, waterLow: true, adh: 90, kcal: 2000, protein: 130,
  name: 'Squat', from: 20, to: 22.5, delta: 2.5, focus: 'الجسم كله', next: 'الأربعاء', n: 5, sets: 12, hard: 6, muscles: 'الصدر، الظهر' };

test('MSG-01: every coach message template renders a clean string for its context', () => {
  for (const group of [NUTRITION, TRAINING, MOTIVATION, { SORENESS, SORENESS_PRE }])
    for (const [key, pool] of Object.entries(group)) {
      assert.ok(pool.length >= 2, `${key} has variety`);
      for (const t of pool) {
        const s = typeof t === 'function' ? t(ctx) : t;
        assert.equal(typeof s, 'string');
        assert.ok(s.length > 20 && !/undefined|NaN|null/.test(s), `${key}: ${s}`);
      }
    }
});

test('MSG-02: tips cover all five areas, are stable per day and rotate across days/offsets', () => {
  const a = dailyTips('2026-10-23'), b = dailyTips('2026-10-23');
  assert.deepEqual(a, b);
  assert.equal(a.length, 5);
  assert.equal(dailyTips('2026-10-23', { hasWorkout: false }).length, 4);
  for (const pool of Object.values(TIPS)) assert.ok(pool.length >= 6);
  assert.notDeepEqual(dailyTips('2026-10-23', { offset: 1 }).map(t => t.text), a.map(t => t.text));
  const seen = new Set(Array.from({ length: 30 }, (_, i) => seedPick(MOTIVATION.general, '2026-11-' + i)));
  assert.ok(seen.size >= 4, 'general motivation varies across days');
});
