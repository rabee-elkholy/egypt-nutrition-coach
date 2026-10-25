// Capture an actual local command. No inferred test totals or environment secrets.
import {spawn, execFileSync} from 'node:child_process';
import {mkdirSync, openSync, closeSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {dirname, resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus, platform, release, totalmem} from 'node:os';
import {sourceProvenance} from './evidence.mjs';

const [label, command, ...args] = process.argv.slice(2);
if (!label || !/^[a-z0-9-]+$/.test(label) || !command) throw Error('Usage: capture-command.mjs <label> <node|npm> <args...>');
const root = resolve('docs/production-readiness/evidence', label);
if (existsSync(join(root, 'execution.json'))) throw Error('Evidence exists; use a new label');
mkdirSync(root, {recursive: true});
const git = args => execFileSync('git', args, {encoding: 'utf8'}).trim();
const sha256 = b => createHash('sha256').update(b).digest('hex');
const {sourceHashes}=sourceProvenance();
const metadata = {command: [command, ...args], cwd: process.cwd(), sourceCommit: git(['rev-parse', 'HEAD']),
  workingTree: git(['status', '--porcelain']), sourceHashes, startedAt: new Date().toISOString(),
  environment: {node: process.version, platform: platform(), release: release(), architecture: process.arch,
    cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem()}, status: 'RUNNING'};
const metaPath = join(root, 'execution.json');
writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
const stdout = openSync(join(root, 'stdout.log'), 'w'), stderr = openSync(join(root, 'stderr.log'), 'w');
const executable = command === 'node' || command === 'npm' ? process.execPath : command;
const actualArgs = command === 'npm' ? [resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args] : args;
const started = performance.now();
const child = spawn(executable, actualArgs, {stdio: ['ignore', stdout, stderr], windowsHide: true});
child.on('error', error => { metadata.error = error.message; });
child.on('close', (code, signal) => {
  closeSync(stdout); closeSync(stderr);
  Object.assign(metadata, {exitCode: code, signal, status: code === 0 ? 'COMPLETED' : 'FAILED',
    finishedAt: new Date().toISOString(), durationMs: performance.now() - started});
  metadata.logs = Object.fromEntries(['stdout.log', 'stderr.log'].map(p => [p, sha256(readFileSync(join(root, p)))]));
  const output = readFileSync(join(root, 'stdout.log'), 'utf8');
  metadata.testSummary = Object.fromEntries([...output.matchAll(/^(?:#|ℹ) (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)].map(m => [m[1], Number(m[2])]));
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  console.log(JSON.stringify({evidence: root, exitCode: code, durationMs: metadata.durationMs, testSummary: metadata.testSummary}));
  process.exitCode = code ?? 1;
});
