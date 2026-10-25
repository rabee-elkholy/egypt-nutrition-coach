import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, existsSync, realpathSync, statSync, mkdirSync, copyFileSync} from 'node:fs';
import path from 'node:path';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function sourceProvenance() {
  const git = args => execFileSync('git', args, {encoding: 'utf8'}).trim();
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.mjs', '*.py', '*.sql', '*.yaml', 'data/*.json', 'package.json', 'package-lock.json', 'wrangler.jsonc', ':(exclude)reports/**', ':(exclude)outputs/**', ':(exclude)docs/production-readiness/evidence/**'])
    .split(/\r?\n/).filter(p => p && existsSync(p));
  return {gitCommit: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']),
    workingTreeDirty: git(['status', '--porcelain']).length > 0,
    sourceHashes: Object.fromEntries([...new Set(files)].sort().map(p => [p, sha256(readFileSync(p))]))};
}

export function snapshotSource(runRoot,hashes,sourceRoot=process.cwd()){
  const target=path.resolve(runRoot,'source');
  for(const [relative,digest] of Object.entries(hashes)){
    if(path.isAbsolute(relative)||relative.includes('\\')||relative.includes(':')||relative.split('/').includes('..'))throw Error('Unsafe source path: '+relative);
    const input=path.resolve(sourceRoot,relative),output=path.join(target,relative);
    if(sha256(readFileSync(input))!==digest)throw Error('Source changed before snapshot: '+relative);
    if(existsSync(output)){
      if(sha256(readFileSync(output))!==digest)throw Error('Frozen source mismatch: '+relative);
    }else{mkdirSync(path.dirname(output),{recursive:true});copyFileSync(input,output);}
  }
  return {directory:'source',files:Object.keys(hashes).length};
}

export function messageRepetition(users) {
  const perUser = users.map(({userId, messages}) => {
    const texts = messages.map(m => m.exactText).filter(t => typeof t === 'string' && t.length);
    const uniqueTexts = new Set(texts).size;
    return {userId, messages: texts.length, uniqueTexts, repeatedFraction: texts.length ? 1 - uniqueTexts / texts.length : null};
  });
  const measured = perUser.filter(u => u.repeatedFraction !== null);
  const texts = users.flatMap(u => u.messages.map(m => m.exactText)).filter(t => typeof t === 'string' && t.length);
  return {definition: 'Unweighted mean over users with messages of 1 - distinct exactText / message count; no normalization of text',
    meanPerUserExactText: measured.length ? measured.reduce((n, u) => n + u.repeatedFraction, 0) / measured.length : null,
    measuredUsers: measured.length, usersWithoutMessages: users.length - measured.length,
    pooledRepeatedFraction: texts.length ? 1 - new Set(texts).size / texts.length : null, perUser};
}

export function cohortDiversity(cohort) {
  const profile = p => p.onboarding || p;
  const distribution = get => cohort.reduce((counts, p) => {
    const values = get(profile(p), p);
    for (const value of Array.isArray(values) ? (values.length ? values : ['none']) : [values ?? 'MISSING']) counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
  return {users: cohort.length, fieldMappings: {experience: 'onboarding.fitnessLevel or fitnessLevel', region: 'onboarding.region or region', medicalConditions: 'onboarding.diseases or diseases'},
    experience: distribution(p => p.fitnessLevel), regions: distribution(p => p.region),
    countries: distribution((p, original) => original.country || p.country),
    countryLimitation: 'A region such as gulf does not establish a specific country; missing country remains MISSING.',
    medicalConditions: distribution(p => p.diseases), injuries: distribution(p => p.injuries),
    personaConsistencyIssues: cohort.flatMap(p => p.sex === 'male' && /طبيبة|مديرة|معلمة|ممرضة|ربة منزل|طالبة/.test(p.occupation || '')
      ? [{userId: p.id || p.userId, code: 'GRAMMATICAL_GENDER_MISMATCH', occupation: p.occupation}] : [])};
}

export function verifyFileManifest(root, files) {
  const entries = Array.isArray(files) ? files.map(f => [f.path, f.sha256]) : Object.entries(files || {});
  if (!entries.length) return ['EMPTY_FILE_MANIFEST'];
  const failures = [], base = realpathSync(root);
  for (const [relative, digest] of entries) {
    if (typeof relative !== 'string' || relative.includes('\\') || relative.includes(':') || path.posix.isAbsolute(relative) || relative.split('/').includes('..')) {
      failures.push('UNSAFE_PATH:' + relative); continue;
    }
    const full = path.resolve(base, relative);
    try {
      const resolved = realpathSync(full), rel = path.relative(base, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel) || !statSync(resolved).isFile()) { failures.push('UNSAFE_PATH:' + relative); continue; }
      if (!/^[a-f0-9]{64}$/.test(digest || '') || sha256(readFileSync(resolved)) !== digest) failures.push('CHECKSUM:' + relative);
    } catch { failures.push('MISSING_FILE:' + relative); }
  }
  return failures;
}
