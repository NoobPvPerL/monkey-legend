"""Upload the independently verified P3 ZIP pair to GitHub; never deploys the game."""
from pathlib import Path
from urllib.parse import urlparse, quote
from urllib.error import HTTPError
from datetime import datetime, timezone
import argparse
import hashlib
import json
import os
import subprocess
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
        with opener.open(urllib.request.Request(url, data=payload, headers=headers, method=method), timeout=300) as response:
            return json.load(response)

    def downloaded_sha(asset):
        headers = {**auth, 'Accept': 'application/octet-stream'}
        with opener.open(urllib.request.Request(API+'/releases/assets/'+str(asset['id']), headers=headers), timeout=300) as response:
            h = hashlib.sha256()
            while chunk := response.read(1024*1024):
                h.update(chunk)
            return h.hexdigest()

    request('GET', '/commits/'+args.commit)
    tag = 'v'+version
    try:
        release = request('GET', '/releases/tags/'+quote(tag, safe=''))
        if release['target_commitish'] != args.commit:
            raise ValueError('Existing release points to another source commit; refusing overwrite')
    except HTTPError as e:
        if e.code != 404:
            raise
        release = request('POST', '/releases', {'tag_name': tag, 'target_commitish': args.commit,
                                               'name': '应猴传说 '+version+' · P3', 'body': args.notes.read_text(encoding='utf-8'),
                                               'draft': True, 'prerelease': False})
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
        report['passed'] = True
        print(json.dumps(report, ensure_ascii=False), flush=True)
    finally:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
