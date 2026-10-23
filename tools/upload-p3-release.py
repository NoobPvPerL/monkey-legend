"""Upload the independently verified P3 ZIP pair to GitHub; never deploys the game."""
from pathlib import Path
from urllib.parse import urlparse, quote
from urllib.error import HTTPError
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import argparse
import hashlib
import json
import os
import subprocess
import time
import urllib.request

REPO = 'NoobPvPerL/monkey-legend'
API = 'https://api.github.com/repos/'+REPO


class GitHubRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        host = urlparse(newurl).hostname or ''
        if urlparse(newurl).scheme != 'https' or not (host in ('github.com', 'api.github.com') or host.endswith('.githubusercontent.com')):
            raise ValueError('Unexpected download redirect host')
        result = super().redirect_request(req, fp, code, msg, headers, newurl)
        if host != urlparse(req.full_url).hostname:
            result.remove_header('Authorization')
        return result


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive', type=Path, required=True)
    p.add_argument('--notes', type=Path, required=True)
    p.add_argument('--commit', required=True)
    p.add_argument('--report', type=Path, required=True)
    args = p.parse_args()
    archive = args.archive.resolve(strict=True)
    sidecar = archive.with_suffix('.zip.sha256')
    validation = json.loads((archive.parent/archive.name.removesuffix('-all.zip')/'PACKAGE-VALIDATION.json').read_text(encoding='utf-8'))
    if validation.get('passed') is not True or validation['sourceCommit'] != args.commit:
        raise ValueError('Independent package validation or source commit mismatch')
    version = validation['version']
    if not archive.name.startswith('monkey-legend-'+version+'-'):
        raise ValueError('Archive version mismatch')
    if sidecar.read_text(encoding='utf-8').split()[0] != digest(archive):
        raise ValueError('Final ZIP checksum mismatch')
    credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                                text=True, capture_output=True, timeout=40,
                                env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'})
    fields = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
    if credential.returncode or not fields.get('password'):
        raise ValueError('Git credential helper unavailable; no credential values are printed')
    opener = urllib.request.build_opener(GitHubRedirect())
    auth = {'Authorization': 'Bearer '+fields['password'], 'User-Agent': 'monkey-legend-delivery', 'Accept': 'application/vnd.github+json'}

    def request(method, path, payload=None):
        url = path if path.startswith('https://') else API+path
        if urlparse(url).hostname not in ('api.github.com', 'uploads.github.com'):
            raise ValueError('Unexpected API host')
        headers = dict(auth)
        if isinstance(payload, dict):
            payload = json.dumps(payload, ensure_ascii=False).encode('utf-8')
            headers['Content-Type'] = 'application/json'
        elif payload is not None:
            headers['Content-Type'] = 'application/octet-stream'
        attempts = 3 if method == 'GET' else 1
        for attempt in range(attempts):
            try:
                with opener.open(urllib.request.Request(url, data=payload, headers=headers, method=method), timeout=60 if method == 'GET' else 300) as response:
                    return json.load(response)
            except OSError as error:
                if isinstance(error, HTTPError) and error.code not in (502, 503, 504):
                    raise
                if attempt == attempts-1:
                    raise
                print(f'GitHub GET retry {attempt+1}: '+type(error).__name__, flush=True)

    def downloaded_sha(asset):
        # Bounded ranges avoid losing an entire large download to a late timeout.
        # No signed URL or credential is persisted. Hash the actual completed bytes.
        cache = Path('.release-cache')/('github-asset-'+str(asset['id'])+'.download')
        cache.parent.mkdir(exist_ok=True)
        total = asset['size']
        if cache.exists() and cache.stat().st_size > total:
            raise ValueError('Download checkpoint exceeds remote asset length')
        offset = cache.stat().st_size if cache.exists() else 0
        ranges = [(start, min(total-1, start+1024*1024-1)) for start in range(offset, total, 1024*1024)]

        def fetch_range(bounds):
            start, end = bounds
            part = cache.with_name(cache.name+f'.{start}-{end}.part')
            if part.exists() and part.stat().st_size == end-start+1:
                return part
            for attempt in range(3):
                headers = {**auth, 'Accept': 'application/octet-stream', 'Range': f'bytes={start}-{end}'}
                url = API+'/releases/assets/'+str(asset['id'])+'?download='+str(time.time_ns())
                try:
                    range_opener = urllib.request.build_opener(GitHubRedirect())
                    with range_opener.open(urllib.request.Request(url, headers=headers), timeout=60) as response:
                        if response.status == 206:
                            if response.headers.get('Content-Range') != f'bytes {start}-{end}/{total}':
                                raise ValueError('Unexpected download range')
                        elif response.status != 200 or start != 0 or end != total-1:
                            raise ValueError('Server did not honor bounded download range')
                        block = response.read(end-start+2)
                        if len(block) != end-start+1:
                            raise ValueError('Incomplete download range')
                    part.write_bytes(block)
                    print(f'Downloaded bytes {start}-{end}/{total}: '+asset['name'], flush=True)
                    return part
                except (TimeoutError, OSError) as error:
                    print(f'Download range retry {attempt+1}: '+type(error).__name__, flush=True)
                    if attempt == 2:
                        raise
        with ThreadPoolExecutor(max_workers=6) as pool:
            parts = list(pool.map(fetch_range, ranges))
        with cache.open('ab') as output:
            for part in parts:
                output.write(part.read_bytes())
        if cache.stat().st_size != total:
            raise ValueError('Completed download length mismatch')
        return digest(cache)

    source_commit = request('GET', '/git/commits/'+args.commit)
    if source_commit['sha'] != args.commit:
        raise ValueError('Remote source commit mismatch')
    tag = 'v'+version
    try:
        release = request('GET', '/releases/tags/'+quote(tag, safe=''))
        if release['target_commitish'] != args.commit:
            raise ValueError('Existing release points to another source commit; refusing overwrite')
    except HTTPError as e:
        if e.code != 404:
            raise
        release = next((item for item in request('GET', '/releases?per_page=100') if item['tag_name'] == tag), None)
        if release is None:
            release = request('POST', '/releases', {'tag_name': tag, 'target_commitish': args.commit,
                                                   'name': '应猴传说 '+version+' · P3', 'body': args.notes.read_text(encoding='utf-8'),
                                                   'draft': True, 'prerelease': False})
        elif release['target_commitish'] != args.commit:
            raise ValueError('Existing draft points to another source commit; refusing overwrite')
    report = {'at': datetime.now(timezone.utc).isoformat(), 'sourceCommit': args.commit,
              'sourceSnapshotSha256': validation['sourceSnapshotSha256'], 'releaseUrl': release['html_url'],
              'tag': tag, 'assets': [], 'passed': False, 'productionDeployed': False}
    try:
        for file in [archive, sidecar]:
            expected = digest(file)
            asset = next((a for a in release['assets'] if a['name'] == file.name), None)
            if asset is None:
                if not release['draft']:
                    raise ValueError('Published release is incomplete; refusing to modify existing publication')
                upload_url = release['upload_url'].split('{')[0]+'?name='+quote(file.name)
                print('Uploading '+file.name, flush=True)
                asset = request('POST', upload_url, file.read_bytes())
            if asset.get('digest') and asset['digest'] != 'sha256:'+expected:
                raise ValueError('GitHub asset digest differs; refusing overwrite')
            if downloaded_sha(asset) != expected:
                raise ValueError('Independently downloaded asset differs from local file')
            report['assets'].append({'name': file.name, 'bytes': file.stat().st_size, 'sha256': expected,
                                     'downloadVerified': True, 'url': asset['browser_download_url']})
        if release['draft']:
            release = request('PATCH', '/releases/'+str(release['id']), {'draft': False})
        published = request('GET', '/releases/tags/'+quote(tag, safe=''))
        if published['draft'] or published['target_commitish'] != args.commit:
            raise ValueError('Release publication verification failed')
        report['publishedAt'] = published['published_at']
        report['releaseUrl'] = published['html_url']
        for verified in report['assets']:
            current = next(a for a in published['assets'] if a['name'] == verified['name'])
            if current['size'] != verified['bytes'] or current.get('digest') not in (None, 'sha256:'+verified['sha256']):
                raise ValueError('Published asset metadata differs from verified download')
            verified['url'] = current['browser_download_url']
        report['passed'] = True
        print(json.dumps(report, ensure_ascii=False), flush=True)
    finally:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
