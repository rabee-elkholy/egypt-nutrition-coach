"""Inspect legacy ZIPs; package and verify complete evidence without extracting ZIP paths.

python scripts/audit/archive-evidence.py inspect INPUT.zip --output audit.json
python scripts/audit/archive-evidence.py package RUN_DIR OUTPUT_DIR
python scripts/audit/archive-evidence.py verify OUTPUT.zip
"""
import argparse
import hashlib
import gzip
import json
import re
from pathlib import Path, PurePosixPath
import sys
import zipfile

MANIFEST = 'archive-manifest.json'
SHARED = {'simulation_config.json', 'cohort.json', 'metrics.json'}
GLOBAL_RAW = {'all_users.jsonl', 'all_days.jsonl', 'all_events.jsonl', 'all_messages.jsonl',
              'all_plans.jsonl', 'all_adaptations.jsonl', 'all_errors.jsonl', 'ground_truth.jsonl'}
USER_RAW = {'persona.json', 'onboarding.json', 'nutrition_plans.jsonl', 'workout_plans.jsonl',
            'daily_behavior.jsonl', 'daily_app_state.jsonl', 'food_diary.jsonl', 'workout_history.jsonl',
            'health_tracking.jsonl', 'messages.jsonl', 'adaptations.jsonl', 'api_events.jsonl',
            'errors.jsonl', 'user_summary.json', 'USER_REPORT_AR.md'}

def digest(value):
    return hashlib.sha256(value).hexdigest()

def safe_name(name):
    p = PurePosixPath(name)
    return bool(name) and not p.is_absolute() and '..' not in p.parts and '\\' not in name and ':' not in name

def required_files(role, cohort, config, kind, schema_version=2):
    required = set(SHARED)
    if role == 'raw':
        required |= GLOBAL_RAW
        if kind == 'LOCAL_WORKER_HTTP_D1':
            required.add('persisted_accounts.json')
            if schema_version >= 2:
                required |= {'database/schema.jsonl', 'database/export_manifest.jsonl', 'runtime-worker.mjs.gz'}
        for persona in cohort:
            uid = persona.get('userId') or persona['id']
            required |= {f'users/{uid}/{f}' for f in USER_RAW}
            if kind == 'LOCAL_WORKER_HTTP_D1':
                required |= {f'users/{uid}/days/{n:03d}.json.gz' for n in range(1, config['days'] + 1)}
    elif role == 'reports':
        required.add('explorer.html' if kind == 'LOCAL_WORKER_HTTP_D1' else 'index.html')
    else:
        raise ValueError('Unknown archive role')
    return required

def inspect_legacy(archive):
    with zipfile.ZipFile(archive) as z:
        entries = [i for i in z.infolist() if not i.is_dir()]
        names = [i.filename for i in entries]
        manifests = [n for n in names if n.endswith('/manifest.json') or n == 'manifest.json']
        if len(manifests) != 1:
            raise ValueError('Expected exactly one legacy manifest')
        manifest_name = manifests[0]
        prefix = manifest_name[:-len('manifest.json')]
        m = json.loads(z.read(manifest_name))
        files = m['files']
        listed = dict((v['path'], v['sha256']) for v in files) if isinstance(files, list) else files
        missing = [p for p in listed if prefix + p not in names]
        mismatch = [p for p, h in listed.items() if prefix + p in names and digest(z.read(prefix + p)) != h]
        unlisted = [n[len(prefix):] for n in names if n.startswith(prefix) and n != manifest_name and n[len(prefix):] not in listed]
        measured = {}
        if prefix + 'index.html' in names:
            html = z.read(prefix + 'index.html').decode('utf-8')
            match = re.search(r'const daysData\s*=\s*', html)
            if match:
                days, _ = json.JSONDecoder().raw_decode(html, match.end())
                repetitions, events, messages, rendered = [], [], 0, 0
                for user_days in days.values():
                    texts = [m['exactText'] for d in user_days for m in d.get('messages', []) if isinstance(m.get('exactText'), str)]
                    if texts:
                        repetitions.append(1 - len(set(texts)) / len(texts))
                    messages += len(texts)
                    rendered += sum(bool(m.get('wasActuallyRendered')) for d in user_days for m in d.get('messages', []))
                    events.extend(e for d in user_days for e in d.get('apiEvents', []))
                measured = {'users': len(days), 'userDays': sum(map(len, days.values())), 'events': len(events),
                            'messages': messages, 'claimedRendered': rendered,
                            'meanPerUserExactTextRepetition': sum(repetitions) / len(repetitions) if repetitions else None,
                            'numericHttpStatusEvents': sum(isinstance(e.get('status'), int) for e in events),
                            'eventsWithHttpRequest': sum('request' in e for e in events)}
        return {'archive': str(archive.resolve()), 'sha256': digest(archive.read_bytes()), 'fileCount': len(names),
                'runId': m.get('runId'), 'claimedCommit': m.get('gitCommit'), 'manifestEntries': len(listed),
                'missingCount': len(missing), 'missing': missing, 'checksumMismatches': mismatch,
                'unlisted': unlisted, 'complete': not missing and not mismatch and not unlisted,
                'dashboardRecomputed': measured}

def verify_archive(archive):
    with zipfile.ZipFile(archive) as z:
        names = [i.filename for i in z.infolist() if not i.is_dir()]
        failures = []
        if len(names) != len(set(names)) or any(not safe_name(n) for n in names):
            raise ValueError('Duplicate or unsafe archive paths')
        m = json.loads(z.read(MANIFEST))
        if m.get('schemaVersion') not in (1, 2) or m.get('evidenceKind') not in ('IN_PROCESS_DOMAIN_ENGINE', 'LOCAL_WORKER_HTTP_D1'):
            raise ValueError('Unsupported manifest schema or evidence kind')
        config = json.loads(z.read('simulation_config.json'))
        cohort = json.loads(z.read('cohort.json'))
        users = config.get('totalCohortUsers', config.get('users'))
        if len(cohort) != users or len({p.get('userId') or p.get('id') for p in cohort}) != users:
            failures.append('COHORT_COUNT_OR_DUPLICATE_ID')
        required = required_files(m['role'], cohort, config, m['evidenceKind'], m['schemaVersion'])
        failures += ['MISSING_REQUIRED:' + n for n in sorted(required - set(names))]
        if set(m['files']) != set(names) - {MANIFEST}:
            failures.append('INVENTORY_MISMATCH')
        for n, expected in m['files'].items():
            if n not in names:
                failures.append('MISSING_FILE:' + n)
                continue
            content = z.read(n)
            if digest(content) != expected['sha256'] or len(content) != expected['bytes']:
                failures.append('CHECKSUM:' + n)
        if m['role'] == 'raw' and 'all_days.jsonl' in names:
            actual = sum(bool(line.strip()) for line in z.read('all_days.jsonl').splitlines())
            if actual != users * config['days']:
                failures.append('USER_DAY_COUNT')
        if m['role'] == 'raw' and m['evidenceKind'] == 'LOCAL_WORKER_HTTP_D1' and m['schemaVersion'] >= 2 and 'database/schema.jsonl' in names and 'database/export_manifest.jsonl' in names:
            schema = json.loads(z.read('database/schema.jsonl'))
            proof = json.loads(z.read('database/export_manifest.jsonl'))
            expected_tables = {item['name'] for item in schema['schema'] if item['type'] == 'table' and item['name'].startswith('coaching_')}
            expected_paths = {'database/' + table + '.jsonl.gz' for table in expected_tables}
            actual_paths = {'database/' + f['path'] for f in proof['files']}
            if not expected_tables or expected_paths != actual_paths:
                failures.append('DATABASE_TABLE_INVENTORY')
            for file in proof['files']:
                name = 'database/' + file['path']
                if not safe_name(name) or name not in names:
                    failures.append('MISSING_DATABASE_TABLE:' + name)
                    continue
                content = z.read(name)
                if digest(content) != file['sha256'] or sum(bool(line.strip()) for line in gzip.decompress(content).splitlines()) != file['rows']:
                    failures.append('DATABASE_CHECKSUM_OR_ROWS:' + name)
            runtime = m.get('runtimeEvidence') or {}
            if runtime.get('path') != 'runtime-worker.mjs.gz' or runtime['path'] not in names or digest(gzip.decompress(z.read(runtime['path']))) != runtime.get('uncompressedSha256'):
                failures.append('RUNTIME_PROVENANCE')
        return {'archive': str(archive.resolve()), 'sha256': digest(archive.read_bytes()), 'role': m['role'],
                'evidenceKind': m['evidenceKind'], 'filesChecked': len(m['files']), 'passed': not failures, 'failures': failures}

def package_run(root, output):
    config = json.loads((root / 'simulation_config.json').read_text(encoding='utf-8-sig'))
    cohort = json.loads((root / 'cohort.json').read_text(encoding='utf-8-sig'))
    original = json.loads((root / 'manifest.json').read_text(encoding='utf-8-sig'))
    kind = 'LOCAL_WORKER_HTTP_D1' if 'engineHashes' in original else 'IN_PROCESS_DOMAIN_ENGINE'
    selected = {}
    for f in root.rglob('*'):
        rel = f.relative_to(root).as_posix()
        if not f.is_file() or any(p.startswith('.') for p in f.relative_to(root).parts):
            continue
        if f.is_symlink() or not f.resolve().is_relative_to(root.resolve()):
            raise ValueError('Symlink or file outside run root')
        if rel in ('manifest.json', MANIFEST) or f.suffix in ('.sqlite', '.db', '.tmp'):
            continue
        selected[rel] = f
    raw = {n for n in selected if n in SHARED or n.endswith(('.jsonl', '.gz')) or n.startswith('users/') or n == 'persisted_accounts.json'}
    reports = {n for n in selected if n in SHARED or (not n.startswith('users/') and not n.endswith(('.jsonl', '.gz')))}
    for role, names in [('raw', raw), ('reports', reports)]:
        missing = required_files(role, cohort, config, kind) - names
        if missing:
            raise ValueError('Incomplete source: ' + ', '.join(sorted(missing)[:20]))
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for role, names in [('raw', raw), ('reports', reports)]:
        target = output / f'curafit-{role}.zip'
        if target.exists():
            raise ValueError('Refusing to overwrite an evidence archive: ' + str(target))
        inventory = {n: {'bytes': selected[n].stat().st_size, 'sha256': digest(selected[n].read_bytes())} for n in sorted(names)}
        m = {'schemaVersion': 2, 'role': role, 'evidenceKind': kind, 'sourceManifestSha256': digest((root / 'manifest.json').read_bytes()),
             'packagerSha256': digest(Path(__file__).read_bytes()),
             'sourceProvenance': original.get('provenance', {'claimedLegacyCommit': original.get('gitCommit'), 'status': 'LEGACY_PROVENANCE_UNVERIFIED'}),
             'files': inventory, 'limitations': ['Archive integrity does not establish application correctness or clinical safety.']}
        if role == 'raw' and kind == 'LOCAL_WORKER_HTTP_D1':
            m['runtimeEvidence'] = original.get('runtimeEvidence')
        with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for n in sorted(names):
                z.write(selected[n], n)
            z.writestr(MANIFEST, json.dumps(m, ensure_ascii=False, indent=2))
        result = verify_archive(target)
        if not result['passed']:
            raise ValueError('Archive failed its own verification: ' + str(result['failures']))
        results.append(result)
    return results

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['inspect', 'verify', 'package'])
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path, nargs='?')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = inspect_legacy(args.source) if args.action == 'inspect' else verify_archive(args.source) if args.action == 'verify' else package_run(args.source, args.destination)
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + '\n', encoding='utf-8')
    if args.action == 'inspect':
        print(json.dumps({k: v for k, v in result.items() if k not in ('missing', 'unlisted')}))
    else:
        print(text)
    if args.action == 'verify' and not result['passed']:
        sys.exit(1)

if __name__ == '__main__':
    main()
