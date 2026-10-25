import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {verifyFileManifest, sha256, messageRepetition, cohortDiversity, sourceProvenance, snapshotSource} from '../scripts/audit/evidence.mjs';
import {evidenceSummary, evidenceQuality, evidenceFindings} from '../simulation/evidence-reports.mjs';
import {checkDayEvidence} from '../scripts/cohort/evidence-checks.mjs';
import {inventory,cohortDayDate} from '../scripts/cohort/common.mjs';

test('manifest detects a mutation in a formerly unsampled file and a missing file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'curafit-integrity-'));
  try {
    const manifest = {};
    for (let i = 0; i < 12; i++) { const name = i + '.txt'; writeFileSync(path.join(dir, name), 'original'); manifest[name] = sha256('original'); }
    assert.deepEqual(verifyFileManifest(dir, manifest), []);
    writeFileSync(path.join(dir, '1.txt'), 'tampered');
    assert.ok(verifyFileManifest(dir, manifest).includes('CHECKSUM:1.txt'));
    rmSync(path.join(dir, '2.txt'));
    assert.ok(verifyFileManifest(dir, manifest).includes('MISSING_FILE:2.txt'));
    assert.deepEqual(verifyFileManifest(dir, {}), ['EMPTY_FILE_MANIFEST']);
    assert.ok(verifyFileManifest(dir, {'../outside': sha256('x')})[0].startsWith('UNSAFE_PATH:'));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
test('repetition preserves exact text and distinguishes per-user mean from pooling', () => {
  const m = messageRepetition([{userId: 'a', messages: [{exactText: 'X'}, {exactText: 'X'}]}, {userId: 'b', messages: [{exactText: 'X'}]}, {userId: 'c', messages: []}]);
  assert.equal(m.meanPerUserExactText, .25);
  assert.equal(m.measuredUsers, 2); assert.equal(m.usersWithoutMessages, 1);
  assert.equal(m.pooledRepeatedFraction, 1 - 1 / 3);
  assert.equal(messageRepetition([{userId: 'x', messages: [{exactText: 'X'}, {exactText: 'X '}]}]).meanPerUserExactText, 0);
});
test('diversity uses actual persona fields and never infers a country from gulf', () => {
  const d = cohortDiversity([{id: 'a', fitnessLevel: 'beginner', region: 'gulf', diseases: ['favism'], injuries: [], sex: 'male', occupation: 'طبيبة مقيمة'}, {userId: 'b', country: 'Egypt', onboarding: {fitnessLevel: 'advanced', region: 'egypt', diseases: [], injuries: ['knee_pain']}}]);
  assert.deepEqual(d.experience, {beginner: 1, advanced: 1});
  assert.deepEqual(d.medicalConditions, {favism: 1, none: 1});
  assert.deepEqual(d.countries, {MISSING: 1, Egypt: 1});
  assert.equal(d.personaConsistencyIssues.length, 1);
});
test('all report narratives use one measured repetition value', () => {
  const m = {messageRepetition: messageRepetition([{userId: 'x', messages: [{exactText: 'a'}, {exactText: 'a'}]}]), totalUsers: 1, totalUserDays: 2, passedGatesCount: 1, stressTests: {passed: 1, total: 1}, subScores: {}, latencies: {}};
  for (const report of [evidenceSummary(m), evidenceQuality(m), evidenceFindings(m, [])]) assert.ok(report.includes('50.00%'));
});
test('provenance records actual full HEAD and source hashes', () => {
  const p = sourceProvenance();
  assert.match(p.gitCommit, /^[a-f0-9]{40}$/); assert.equal(p.branch, 'main');
  assert.equal(p.sourceHashes['scripts/audit/evidence.mjs'], sha256(readFileSync(new URL('../scripts/audit/evidence.mjs', import.meta.url))));
});

test('archived source copies are evidence outputs, not inputs to the next run',()=>{
 const dir=mkdtempSync(path.join(process.cwd(),'reports','provenance-control-'));
 try{
  writeFileSync(path.join(dir,'archived-worker.mjs'),'// frozen historical output');
  const p=sourceProvenance();
  assert.ok(!Object.keys(p.sourceHashes).some(name=>name.startsWith('reports/')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('source snapshots preserve exact inputs and refuse changed inputs or overwritten evidence',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'curafit-source-'));
 try{
  const input=path.join(dir,'inputs'),run=path.join(dir,'run');mkdirSync(input);writeFileSync(path.join(input,'engine.mjs'),'original');
  const hashes={'engine.mjs':sha256('original')};
  assert.deepEqual(snapshotSource(run,hashes,input),{directory:'source',files:1});
  assert.equal(readFileSync(path.join(run,'source','engine.mjs'),'utf8'),'original');
  writeFileSync(path.join(input,'engine.mjs'),'changed');
  assert.throws(()=>snapshotSource(run,hashes,input),/Source changed/);
  assert.throws(()=>snapshotSource(run,{'engine.mjs':sha256('changed')},input),/Frozen source mismatch/);
  assert.throws(()=>snapshotSource(run,{'../outside':sha256('x')},input),/Unsafe source path/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('HTTP evaluator independently rejects injected identity, latency, rendering, plan and validation defects', () => {
  const fixture = {userId:'u', records:[{eventId:'e', status:200, requestId:'r', requestUrl:'http://local/v1/commands', request:{method:'POST', endpoint:'commands'}, identityContext:{userId:'u'}, requestHeaders:{'oai-authenticated-user-id':'u','Idempotency-Key':'key'}, idempotencyKey:'key', latencyMs:1, latencyProvenance:'LOCAL_MINIFLARE_DISPATCH_WITH_D1'}], messages:[{messageId:'m', wasActuallyRendered:false, visibleAt:null, renderingStatus:'NOT_MEASURED'}], state:{plans:[{id:'p'}],active_plan_id:'p'}};
  assert.deepEqual(checkDayEvidence(fixture), []);
  for(const [prefix, mutate] of [
    ['IDENTITY_CONTEXT', b=>b.records[0].identityContext.userId='other'],
    ['LATENCY_PROVENANCE', b=>b.records[0].latencyProvenance='PRODUCTION_ESTIMATE'],
    ['FABRICATED_RENDERING', b=>b.messages[0].wasActuallyRendered=true],
    ['DUPLICATE_PLAN_ID', b=>b.state.plans.push({id:'p'})],
    ['MISSING_ACTIVE_PLAN_SNAPSHOT', b=>b.state.active_plan_id='orphan'],
    ['INVALID_ACTION_NOT_REJECTED', b=>b.records[0].expectedOutcome='VALIDATION_ERROR'],
    ['IDEMPOTENCY_CONTEXT', b=>delete b.records[0].idempotencyKey],
  ]) {const mutated=structuredClone(fixture);mutate(mutated);assert.ok(checkDayEvidence(mutated).some(f=>f.startsWith(prefix)),prefix);}
});
test('run inventory retains nested manifests and verification reports',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'curafit-inventory-'));
  try{
    mkdirSync(path.join(dir,'engineering'));
    for(const name of ['manifest.json','verification.json','engineering/manifest.json','engineering/verification.json'])writeFileSync(path.join(dir,name),'{}');
    assert.deepEqual(inventory(dir).map(f=>f.path).sort(),['engineering/manifest.json','engineering/verification.json']);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('failed onboarding cannot freeze the calendar or pass temporal evidence checks',()=>{
 const rejected={serverDate:'2026-10-24',profile:null},dates=Array.from({length:90},(_,i)=>cohortDayDate(rejected,'2026-10-24',i+1));
 assert.equal(new Set(dates).size,90);assert.equal(dates[0],'2026-10-24');assert.equal(dates.at(-1),'2027-01-21');
 const failures=checkDayEvidence({date:'2026-10-24',records:[],messages:[],state:{}},'2026-10-25');
 assert.ok(failures.some(f=>f.startsWith('CALENDAR_DATE:')));
});
