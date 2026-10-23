"""Synthetic in-memory archive guards only; never assembles the actual game delivery."""
from pathlib import Path
from io import BytesIO
from unittest import TestCase, main
from unittest.mock import patch
import importlib.util
import json
import stat
import tempfile
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('p3_delivery', ROOT/'tools/package-p3-delivery.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


def archive(entries):
    buffer = BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', UserWarning)
        with zipfile.ZipFile(buffer, 'w') as z:
            for name, data in entries:
                if isinstance(name, str):
                    info = zipfile.ZipInfo('entry')
                    info.filename = info.orig_filename = name
                else:
                    info = name
                z.writestr(info, data)
    buffer.seek(0)
    return buffer


class P3DeliveryGuards(TestCase):
    def setUp(self):
        cache = ROOT/'.release-cache'
        cache.mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(prefix='p3-delivery-unit-', dir=cache)
        self.folder = Path(self.tmp.name).resolve()
        self.assertTrue(self.folder.is_relative_to(cache.resolve()))

    def tearDown(self):
        self.tmp.cleanup()

    def test_safe_unicode_member_extracts_fixture_only(self):
        delivery.extract_checked(archive([('目录/fixture.txt', b'x')]), self.folder)
        self.assertEqual((self.folder/'目录/fixture.txt').read_bytes(), b'x')

    def test_traversal_and_windows_paths_are_rejected_before_extraction(self):
        for name in ['../outside.txt', '/outside.txt', 'C:/outside.txt', 'a:b', 'a//b', 'a/./b', 'a\\b']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                delivery.extract_checked(archive([(name, b'x')]), self.folder)

    def test_duplicate_members_and_symlinks_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            delivery.extract_checked(archive([('x', b'1'), ('x', b'2')]), self.folder)
        link = zipfile.ZipInfo('link')
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.assertRaisesRegex(ValueError, 'symlink'):
            delivery.extract_checked(archive([(link, b'../outside')]), self.folder)

    def test_suffix_cannot_escape_releases(self):
        for suffix in ['../other', 'bad/path', '', 'BAD']:
            with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                delivery.plan(suffix)

    def test_mixed_source_sql_profiles_are_rejected(self):
        sm = {**delivery.PROFILE, 'sourceCommit': 'a'*40, 'sourceDirty': False, 'sourceSnapshotSha256': 'b'*64}
        delivery.manifests(sm, dict(sm))
        for key in delivery.PROFILE:
            with self.subTest(key=key), self.assertRaises(ValueError):
                delivery.manifests(sm, {**sm, key: 'old'})

    def test_dirty_source_without_snapshot_refuses_before_creating_outputs(self):
        (self.folder/'package.json').write_text(json.dumps({'version': delivery.PROFILE['version']}), encoding='utf-8')
        config = self.folder/'public-fixture.json'
        config.write_text(json.dumps({'endpoint': 'https://fixture.invalid', 'publishableKey': 'fixture-only'}), encoding='utf-8')
        with patch.object(delivery, 'ROOT', self.folder), patch.object(delivery.subprocess, 'check_output', return_value=' M fixture'), patch.object(delivery.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'Commit reviewed source'):
                delivery.assemble(config, 'unit', False)
            run.assert_not_called()
        self.assertFalse((self.folder/'releases').exists())

    def test_finalize_rejects_unverified_or_other_snapshot_without_writing_zip(self):
        output = self.folder/'releases'/('monkey-legend-'+delivery.PROFILE['version']+'-unit')
        output.mkdir(parents=True)
        state = {'version': delivery.PROFILE['version'], 'delivery': str(output), 'snapshot': 'a'*64,
                 'sourceCommit': 'b'*40, 'sourceDirty': False, 'archiveHashes': {}}
        path = self.folder/'state.json'
        path.write_text(json.dumps(state), encoding='utf-8')
        for report in [{'passed': False}, {'passed': True, 'version': delivery.PROFILE['version'],
                       'sourceSnapshotSha256': 'wrong', 'sourceCommit': state['sourceCommit'], 'sourceDirty': False}]:
            (output/'PACKAGE-VALIDATION.json').write_text(json.dumps(report), encoding='utf-8')
            with patch.object(delivery, 'ROOT', self.folder), self.assertRaises(ValueError):
                delivery.finalize(path)
        self.assertFalse(list(output.parent.glob('*.zip')))


if __name__ == '__main__':
    main()
