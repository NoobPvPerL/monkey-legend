import {expect,it} from 'vitest';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {APPLICATION_VERSION,CURRENT_RULE_VERSION,REQUIRED_ENGINE_REVISION} from '../../packages/online/src/version';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import {P3_DELIVERY_PROFILE,containedPath,assertP3Manifests,hash,verifyManifest,p3UpgradeFile} from '../../tools/p3-package-inputs.mjs';
import {databasePackagePlan,DATABASE_UPGRADE_BASES} from '../../tools/database-package-plan.mjs';
function fixtures(){const files={'README.md':hash('fixture')},sourceSnapshotSha256=hash(Object.entries(files).map(([f,s])=>`${s}  ${f}\n`).join('')),sm={...P3_DELIVERY_PROFILE,sourceCommit:'a'.repeat(40),sourceDirty:false,sourceSnapshotSha256,files};return {sm,dm:{...sm,files:{'verify.sql':hash('fixture')}}};}
it('P3 delivery profile matches the actual app, database requirement and full runtime counts',async()=>{
 const runtime=runtimeForVersion(CURRENT_RULE_VERSION);
 expect(P3_DELIVERY_PROFILE).toEqual({version:APPLICATION_VERSION,ruleVersion:CURRENT_RULE_VERSION,schemaVersion:2,engineRevision:REQUIRED_ENGINE_REVISION,characterDefinitions:runtime.characterIds.length,cardDefinitions:Object.keys(runtime.cards).length,cardInstances:runtime.allCards.length});expect(JSON.parse(await readFile('package.json','utf8')).version).toBe(P3_DELIVERY_PROFILE.version);
});
it('valid paired source and SQL manifests bind one source snapshot',()=>{const {sm,dm}=fixtures();expect(()=>assertP3Manifests(sm,dm)).not.toThrow();});
it('verifier upgrade filenames match the actual installer plan for all supported baselines',async()=>{const migrations=(await readdir('database/migrations')).filter(file=>file.endsWith('.sql')).map(file=>({file,body:'-- name-only test fixture'})),plan=databasePackagePlan(APPLICATION_VERSION,migrations,true);for(const base of DATABASE_UPGRADE_BASES)expect(plan.files).toHaveProperty(p3UpgradeFile(base));for(const base of [4,17,30])expect(()=>p3UpgradeFile(base)).toThrow();});
for(const key of Object.keys(P3_DELIVERY_PROFILE))it(`manifest rejects stale ${key} in either archive`,()=>{const {sm,dm}=fixtures();for(const target of ['source','sql']){const bad={...(target==='source'?sm:dm),[key]:'old'};expect(()=>assertP3Manifests(target==='source'?bad:sm,target==='sql'?bad:dm)).toThrow();}});
it('mixed commits, false snapshot digests and dishonest dirty markers are rejected',()=>{const {sm,dm}=fixtures();expect(()=>assertP3Manifests(sm,{...dm,sourceCommit:'b'.repeat(40)})).toThrow();expect(()=>assertP3Manifests({...sm,files:{'README.md':hash('tamper')}},dm)).toThrow();expect(()=>assertP3Manifests({...sm,sourceDirty:'false'},{...dm,sourceDirty:'false'})).toThrow();});
it('manifest paths reject traversal, absolute paths, Windows drives, ADS and empty components',()=>{for(const path of ['../x','a/../../x','C:/x','C:\\x','/x','\\server\\share','a:b','a//b','a/./b','a\u0000b',''])expect(()=>containedPath(resolve('.release-cache'),path),path).toThrow();expect(containedPath(resolve('.release-cache'),'中文目录/a.txt')).toBe(resolve('.release-cache/中文目录/a.txt'));});
it('manifest verification reads actual files and detects altered bytes',async()=>{const root=resolve('.release-cache/p3-input-tests',randomUUID());await mkdir(root,{recursive:true});await writeFile(resolve(root,'fixture.txt'),'fixture');const manifest={files:{'fixture.txt':hash('fixture')}};await expect(verifyManifest(root,manifest)).resolves.toBeUndefined();await writeFile(resolve(root,'fixture.txt'),'tamper');await expect(verifyManifest(root,manifest)).rejects.toThrow();});
