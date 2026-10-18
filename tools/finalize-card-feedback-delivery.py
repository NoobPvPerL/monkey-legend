"""Seal the independently validated card-feedback package; no upload/deployment."""
from pathlib import Path
import hashlib, json, zipfile

root = Path(__file__).resolve().parent.parent
state = json.loads((root/'.release-cache/card-feedback-package-current.json').read_text(encoding='utf-8'))
delivery, source = Path(state['delivery']), Path(state['source'])
report_path = delivery/'PACKAGE-VALIDATION.json'
report = json.loads(report_path.read_text(encoding='utf-8'))
assert report['passed'] and report['independentNpmCi'] and report['independentBuild']
assert report['health'] == dict(ok=True, version='0.2.8-p2.9', ruleVersion='web-v0.1.10', requiredEngineRevision=21)
report['clientAssets'] = {f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted((source/'dist/assets').glob('index*'))}
report['sourceManifestFiles'] = len(json.loads((source/'source-manifest.json').read_text(encoding='utf-8'))['files'])
report['regression'] = {}
for label, name in [('fullBeforeAudio','full-regression.json'),('finalRuleBoundaries','final-boundaries.json'),('defaultAudio','default-audio-regression.json')]:
    data = json.loads((source/'artifacts/p2-card-feedback'/name).read_text(encoding='utf-8'))
    assert data['success'] and data['numFailedTests'] == 0
    report['regression'][label] = dict(files=len(data['testResults']), passed=data['numPassedTests'])
report['scopeNotes'] = ['Default audio unlocks on ordinary user interaction; no toggle.', 'Yinghao collision feedback remains unreproduced; monkey-game immunity is not implemented.', 'Weiwen/purple original reported scenes remain unidentified; basic flows and explicit UI verified locally.', 'No production write or Issue closure.']
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
guide = delivery/'PROMPT-TO-WORKBUDDY.md'
text = guide.read_text(encoding='utf-8').replace('(p2-card-feedback-validation.md)', '(RELEASE-NOTES.md)')
text += '\n\n## 本包独立验证\n\n完整20只需追加021；18／19使用对应升级SQL。独立解压后离线安装、构建、启动及92素材检查通过；隔离新装和18／19／20增量升级、重复安装与权限保留通过。详见PACKAGE-VALIDATION.json。\n\n实际前端资源SHA256：\n\n' + '\n'.join('- '+name+'：'+sha for name,sha in report['clientAssets'].items())+'\n'
guide.write_text(text,encoding='utf-8')
files = sorted(p for p in delivery.iterdir() if p.is_file() and p.name != 'SHA256SUMS.txt')
(delivery/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in files),encoding='utf-8')
outer = delivery.parent/(delivery.name+'-all.zip')
assert not outer.exists()
with zipfile.ZipFile(outer,'x',compression=zipfile.ZIP_STORED) as z:
    for p in sorted(delivery.iterdir()):
        if p.is_file(): z.write(p,p.relative_to(delivery.parent).as_posix())
with zipfile.ZipFile(outer) as z:
    assert z.testzip() is None
    for p in sorted(delivery.iterdir()):
        if p.is_file(): assert hashlib.sha256(z.read(p.relative_to(delivery.parent).as_posix())).digest() == hashlib.sha256(p.read_bytes()).digest()
sha = hashlib.sha256(outer.read_bytes()).hexdigest()
outer.with_suffix(outer.suffix+'.sha256').write_text(sha+'  '+outer.name+'\n',encoding='utf-8')
(root/'artifacts/p2-card-feedback/package-validation.json').write_text(report_path.read_text(encoding='utf-8'),encoding='utf-8')
print(json.dumps(dict(path=str(outer),MiB=round(outer.stat().st_size/1048576,2),sha256=sha,sourceSnapshotSha256=state['snapshot'],sourceCommit=report['sourceCommit'],sourceDirty=report['sourceDirty']),ensure_ascii=False))
