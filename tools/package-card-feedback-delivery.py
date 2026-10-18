"""Package an explicit working-tree feedback source/SQL snapshot; never deploys or pushes."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, subprocess, sys, zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
assert version == '0.2.8-p2.9'
if len(sys.argv) != 2:
    raise SystemExit('Usage: python tools/package-card-feedback-delivery.py <publicConfig.json>')
config = Path(sys.argv[1]).resolve(strict=True)
suffix = 'card-feedback-workbuddy'
delivery = root/'releases'/f'monkey-legend-{version}-{suffix}'
delivery.mkdir(parents=True, exist_ok=False)
subprocess.run(['node','tools/package-online.mjs',str(config),suffix,'--snapshot'],cwd=root,check=True)
subprocess.run(['node','tools/package-database.mjs','--upgrade',suffix],cwd=root,check=True)
source = root/'releases'/f'monkey-legend-{version}-online-source-{suffix}'
sql = root/'releases'/f'monkey-legend-{version}-database-{suffix}'
sm = json.loads((source/'source-manifest.json').read_text(encoding='utf-8'))
dm = json.loads((sql/'manifest.json').read_text(encoding='utf-8'))
assert sm['sourceCommit'] == dm['sourceCommit'] and sm['sourceDirty'] == dm['sourceDirty']
dm.update(sourceSnapshotSha256=sm['sourceSnapshotSha256'], characterCount=16,
          cardDefinitionCount=76, cardEntityCount=191)
(sql/'manifest.json').write_text(json.dumps(dm,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for name in ['UPGRADE-FROM-018-ONE-STATEMENT.sql','UPGRADE-FROM-019-ONE-STATEMENT.sql','UPGRADE-FROM-020-ONE-STATEMENT.sql']:
    (delivery/name).write_bytes((sql/name).read_bytes())
archives=[]
for folder in [source,sql]:
    path=delivery/(folder.name+'.zip')
    with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for file in sorted(folder.rglob('*')):
            if file.is_file(): z.write(file,file.relative_to(folder.parent).as_posix())
    archives.append(path)
guide=(root/'docs/p2-card-feedback-workbuddy.md').read_text(encoding='utf-8')
guide+='\n## 本次实际文件\n\n'+'\n'.join('- '+p.name for p in archives)
guide+='\n\n源码提交：'+sm['sourceCommit']+'\n\n源码快照SHA256：'+sm['sourceSnapshotSha256']+'\n'
(delivery/'PROMPT-TO-WORKBUDDY.md').write_text(guide,encoding='utf-8')
(delivery/'RELEASE-NOTES.md').write_text((root/'docs/p2-card-feedback-validation.md').read_text(encoding='utf-8'),encoding='utf-8')
(delivery/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in [*archives,*[delivery/f'UPGRADE-FROM-{base:03d}-ONE-STATEMENT.sql' for base in [18,19,20]]]),encoding='utf-8')
cache=root/'.release-cache'/('card-feedback-package-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
extracted=cache/'独立解压验证';extracted.mkdir(parents=True)
for archive in archives:
    with zipfile.ZipFile(archive) as z:
        for name in z.namelist(): assert (extracted/name).resolve().is_relative_to(extracted.resolve())
        z.extractall(extracted)
state={'delivery':str(delivery),'cache':str(cache),'source':str(extracted/source.name),
       'sql':str(extracted/sql.name),'snapshot':sm['sourceSnapshotSha256'],'archives':[str(p) for p in archives]}
(root/'.release-cache/card-feedback-package-current.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'delivery':str(delivery),'sourceSnapshotSha256':state['snapshot'],
                 'archivesMiB':{p.name:round(p.stat().st_size/1048576,2) for p in archives}},ensure_ascii=False))
