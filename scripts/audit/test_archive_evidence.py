"""Negative controls for archive completeness and inventory verification."""
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
import importlib.util
import gzip
import hashlib
spec = importlib.util.spec_from_file_location('archive_evidence', Path(__file__).with_name('archive-evidence.py'))
archive_evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive_evidence)
package_run, verify_archive = archive_evidence.package_run, archive_evidence.verify_archive
USER_RAW, GLOBAL_RAW = archive_evidence.USER_RAW, archive_evidence.GLOBAL_RAW

class ArchiveIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='curafit-archive-test-')
        self.root = Path(self.temp.name) / 'run'
        self.root.mkdir()
        runtime = b'// test fixture; no backend execution claimed'
        self.write('manifest.json', {'engineHashes': {}, 'gitCommit': 'test-only', 'runtimeEvidence': {'path': 'runtime-worker.mjs.gz', 'uncompressedSha256': hashlib.sha256(runtime).hexdigest()}})
        (self.root / 'runtime-worker.mjs.gz').write_bytes(gzip.compress(runtime))
        self.write('simulation_config.json', {'users': 1, 'days': 1})
        self.write('cohort.json', [{'userId': 'user-001'}])
        self.write('metrics.json', {})
        self.write('persisted_accounts.json', [])
        self.write('database/schema.jsonl', {'schema': [{'type': 'table', 'name': 'coaching_test', 'sql': 'test fixture only'}]})
        compressed = gzip.compress(b'')
        (self.root / 'database/coaching_test.jsonl.gz').write_bytes(compressed)
        self.write('database/export_manifest.jsonl', {'files': [{'path': 'coaching_test.jsonl.gz', 'rows': 0, 'sha256': hashlib.sha256(compressed).hexdigest()}]})
        (self.root / 'explorer.html').write_text('test fixture')
        for name in GLOBAL_RAW:
            (self.root / name).write_text('{}\n' if name == 'all_days.jsonl' else '')
        for name in USER_RAW:
            self.write('users/user-001/' + name, {})
        self.write('users/user-001/days/001.json.gz', {})
        self.out = Path(self.temp.name) / 'archives'
        package_run(self.root, self.out)

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name, value):
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(json.dumps(value), encoding='utf-8')

    def mutate(self, name, transform):
        source = self.out / name
        with zipfile.ZipFile(source) as z:
            files = {n: z.read(n) for n in z.namelist()}
        transform(files)
        target = self.out / ('mutated-' + name)
        with zipfile.ZipFile(target, 'w') as z:
            for n, value in files.items():
                z.writestr(n, value)
        return target

    def test_complete_archives_verify_independently(self):
        for name in ['curafit-raw.zip', 'curafit-reports.zip']:
            self.assertTrue(verify_archive(self.out / name)['passed'])

    def test_missing_day_rejected_even_if_removed_from_manifest(self):
        def remove(files):
            name = 'users/user-001/days/001.json.gz'
            del files[name]
            manifest = json.loads(files['archive-manifest.json'])
            del manifest['files'][name]
            files['archive-manifest.json'] = json.dumps(manifest).encode()
        result = verify_archive(self.mutate('curafit-raw.zip', remove))
        self.assertIn('MISSING_REQUIRED:users/user-001/days/001.json.gz', result['failures'])

    def test_tampered_report_rejected(self):
        result = verify_archive(self.mutate('curafit-reports.zip', lambda files: files.update({'explorer.html': b'tampered'})))
        self.assertIn('CHECKSUM:explorer.html', result['failures'])

    def test_unlisted_file_rejected(self):
        result = verify_archive(self.mutate('curafit-reports.zip', lambda files: files.update({'extra.md': b'unlisted'})))
        self.assertIn('INVENTORY_MISMATCH', result['failures'])

    def test_unsafe_path_rejected(self):
        with self.assertRaisesRegex(ValueError, 'unsafe'):
            verify_archive(self.mutate('curafit-reports.zip', lambda files: files.update({'../escape': b'bad'})))

    def test_incomplete_source_cannot_be_packaged(self):
        (self.root / 'users/user-001/days/001.json.gz').unlink()
        with self.assertRaisesRegex(ValueError, 'Incomplete source'):
            package_run(self.root, self.out / 'incomplete')

    def test_database_table_missing_even_if_removed_from_archive_inventory(self):
        def remove(files):
            name = 'database/coaching_test.jsonl.gz'
            del files[name]
            manifest = json.loads(files['archive-manifest.json'])
            del manifest['files'][name]
            files['archive-manifest.json'] = json.dumps(manifest).encode()
        result = verify_archive(self.mutate('curafit-raw.zip', remove))
        self.assertIn('MISSING_DATABASE_TABLE:database/coaching_test.jsonl.gz', result['failures'])

if __name__ == '__main__':
    unittest.main(verbosity=2)
