"""P3 delivery preparation. --check is read-only; assemble/finalize require prior owner approval."""
from pathlib import Path, PurePosixPath, PureWindowsPath
from datetime import datetime, timezone
import argparse
import hashlib
import json
import re
import stat
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PROFILE = json.loads((ROOT/'tools/p3-delivery-profile.json').read_text(encoding='utf-8'))
PUBLIC_KEYS = {'applicationId', 'resourceId', 'endpoint', 'oauthRelayBaseUrl', 'publishableKey'}


def need(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def safe_member(name):
    need(bool(name) and '\\' not in name and ':' not in name and all(ord(c) >= 32 for c in name), 'Invalid archive path')
    need(not PurePosixPath(name).is_absolute() and not PureWindowsPath(name).drive, 'Absolute archive path')
    need(all(p and p not in ('..', '.') for p in name.rstrip('/').split('/')), 'Archive path traversal')
    return name


def extract_checked(archive, destination):
    destination = Path(destination).resolve()
    seen = set()
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            safe_member(item.orig_filename)
            safe_member(item.filename)
            need(item.filename not in seen, 'Duplicate archive member')
            seen.add(item.filename)
            need(not stat.S_ISLNK(item.external_attr >> 16), 'Archive symlink forbidden')
            need((destination/item.filename).resolve().is_relative_to(destination), 'Archive escaped destination')
        z.extractall(destination)


def zip_folder(folder, target):
    with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for file in sorted(folder.rglob('*')):
            need(not file.is_symlink(), 'Package symlink forbidden')
            if file.is_file():
                z.write(file, safe_member(file.relative_to(folder.parent).as_posix()))


def plan(suffix):
    need(bool(re.fullmatch('[a-z0-9-]+', suffix)), 'Invalid suffix')
    need(read_json(ROOT/'package.json')['version'] == PROFILE['version'], 'Stale P3 delivery profile')
    version = PROFILE['version']
    return {kind: ROOT/'releases'/f'monkey-legend-{version}-{part}{suffix}' for kind, part in
            [('delivery', ''), ('source', 'online-source-'), ('sql', 'database-')]}


def manifests(sm, dm):
    for key, value in PROFILE.items():
        need(sm.get(key) == value and dm.get(key) == value, 'Manifest profile mismatch: '+key)
    need(sm['sourceCommit'] == dm['sourceCommit'] and sm['sourceDirty'] == dm['sourceDirty'], 'Mixed source/SQL commits')
    need(bool(re.fullmatch('[a-f0-9]{64}', sm['sourceSnapshotSha256'])), 'Invalid source snapshot')


def assemble(config, suffix, snapshot):
    paths = plan(suffix)
    need(config is not None, 'Public configuration path required')
    raw = read_json(config)
    public = raw.get('publicConfig', raw)
    need(isinstance(public.get('publishableKey'), str) and bool(public['publishableKey']) and
         isinstance(public.get('endpoint'), str) and public['endpoint'].startswith('https://'), 'Expected public HTTPS SDK configuration')
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip())
    need(not dirty or snapshot, 'Commit reviewed source/evidence first or explicitly authorize a working-tree --snapshot')
    need(all(not p.exists() for p in paths.values()), 'Delivery output already exists; never overwrite')
    (ROOT/'releases').mkdir(exist_ok=True)
    source_args = ['node', 'tools/package-online.mjs', str(config), suffix]
    if snapshot:
        source_args.append('--snapshot')
    subprocess.run(source_args, cwd=ROOT, check=True)
    subprocess.run(['node', 'tools/package-database.mjs', '--upgrade', suffix], cwd=ROOT, check=True)
    source, sql, delivery = paths['source'], paths['sql'], paths['delivery']
    sm, dm = read_json(source/'source-manifest.json'), read_json(sql/'manifest.json')
    manifests(sm, dm)
    for file, expected in dm['files'].items():
        if file.startswith('migrations/'):
            need(sm['files'].get('database/'+file) == expected, 'Source/SQL migration drift: '+file)
    dm['sourceSnapshotSha256'] = sm['sourceSnapshotSha256']
    write_json(sql/'manifest.json', dm)
    delivery.mkdir()
    for base in range(18, 30):
        name = f'UPGRADE-FROM-{base:03d}-ONE-STATEMENT.sql'
        (delivery/name).write_bytes((sql/name).read_bytes())
    archives = []
    for folder in [source, sql]:
        archive = delivery/(folder.name+'.zip')
        zip_folder(folder, archive)
        archives.append(archive)
    # Read guide/review notes from the captured source, never newer workspace text.
    guide = (source/'docs/p3-workbuddy.md').read_text(encoding='utf-8')
    guide += '\n\n源码提交：'+sm['sourceCommit']+'\n源码快照SHA256：'+sm['sourceSnapshotSha256']+'\n'
    (delivery/'PROMPT-TO-WORKBUDDY.md').write_text(guide, encoding='utf-8')
    (delivery/'RELEASE-NOTES.md').write_bytes((source/'docs/web-rules-v0.1.19.md').read_bytes())
    cache = ROOT/'.release-cache'/('p3-package-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    extracted = cache/'独立解压验证'
    extracted.mkdir(parents=True, exist_ok=False)
    for archive in archives:
        extract_checked(archive, extracted)
    state = {'version': PROFILE['version'], 'delivery': str(delivery), 'cache': str(cache),
             'source': str(extracted/source.name), 'sql': str(extracted/sql.name),
             'snapshot': sm['sourceSnapshotSha256'], 'sourceCommit': sm['sourceCommit'], 'sourceDirty': sm['sourceDirty'],
             'archiveHashes': {p.name: sha(p) for p in archives}}
    write_json(cache/'state.json', state)
    write_json(ROOT/'.release-cache/p3-package-current.json', state)
    print(json.dumps({'delivery': str(delivery), 'state': str(cache/'state.json'),
                      'sourceSnapshotSha256': state['snapshot'], 'verified': False}, ensure_ascii=False))


def finalize(state_path):
    current = read_json(state_path)
    delivery = Path(current['delivery']).resolve()
    need(delivery.parent == (ROOT/'releases').resolve() and delivery.name.startswith('monkey-legend-'+PROFILE['version']+'-'), 'Delivery escaped versioned releases directory')
    need(current['version'] == PROFILE['version'], 'Stale package state')
    validation = read_json(delivery/'PACKAGE-VALIDATION.json')
    need(validation.get('passed') is True and validation.get('version') == PROFILE['version'], 'Independent validation did not pass')
    need(validation.get('sourceSnapshotSha256') == current['snapshot'] and
         validation.get('sourceCommit') == current['sourceCommit'] and validation.get('sourceDirty') == current['sourceDirty'], 'Verification belongs to another snapshot')
    need(validation.get('archiveHashes') == current['archiveHashes'], 'Archive verification binding missing')
    for name, expected in current['archiveHashes'].items():
        safe_member(name)
        need('/' not in name and sha(delivery/name) == expected, 'Archive changed after validation')
    files = sorted(p for p in delivery.iterdir() if p.is_file() and p.name != 'SHA256SUMS.txt')
    need(all(not p.is_symlink() for p in files), 'Delivery symlink forbidden')
    (delivery/'SHA256SUMS.txt').write_text(''.join(sha(p)+'  '+p.name+'\n' for p in files), encoding='utf-8')
    target = delivery.with_name(delivery.name+'-all.zip')
    need(not target.exists(), 'Final ZIP already exists')
    zip_folder(delivery, target)
    target.with_suffix('.zip.sha256').write_text(sha(target)+'  '+target.name+'\n', encoding='utf-8')
    print(json.dumps({'archive': str(target), 'sha256': sha(target), 'uploaded': False}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--check', action='store_true')
    modes.add_argument('--assemble', action='store_true')
    modes.add_argument('--finalize', action='store_true')
    parser.add_argument('--config', type=Path)
    parser.add_argument('--suffix', default='p3-workbuddy')
    parser.add_argument('--snapshot', action='store_true')
    parser.add_argument('--state', type=Path, default=ROOT/'.release-cache/p3-package-current.json')
    args = parser.parse_args()
    if args.check:
        paths = plan(args.suffix)
        print(json.dumps({'profile': PROFILE, 'outputs': {k: str(v) for k, v in paths.items()},
                          'existingOutputs': [str(p) for p in paths.values() if p.exists()],
                          'buildExecuted': False}, ensure_ascii=False))
    elif args.assemble:
        assemble(args.config.resolve(strict=True) if args.config else None, args.suffix, args.snapshot)
    else:
        finalize(args.state)


if __name__ == '__main__':
    main()
