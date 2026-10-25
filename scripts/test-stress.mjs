import { runStressTests } from '../simulation/stress-tests.mjs';

const res = await runStressTests();
console.log('Stress tests result: ' + res.passedCount + ' / ' + res.total);
for (const r of res.results) {
  console.log((r.passed ? '[PASS] ' : '[FAIL] ') + r.id + ': ' + r.title + ' -> ' + r.actualStatus + ' (' + r.message + ')');
}
if (res.passedCount !== res.total) process.exitCode = 1;
