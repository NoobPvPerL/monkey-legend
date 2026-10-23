import {readFileSync} from 'node:fs';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep,isAbsolute,win32} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {DATABASE_UPGRADE_BASES} from './database-package-plan.mjs';
export const P3_DELIVERY_PROFILE=JSON.parse(readFileSync(new URL('./p3-delivery-profile.json',import.meta.url),'utf8'));
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function p3UpgradeFile(base){assert(DATABASE_UPGRADE_BASES.includes(base),'Unsupported complete upgrade baseline');return `UPGRADE-FROM-${String(base).padStart(3,'0')}-ONE-STATEMENT.sql`;}
export function containedPath(root,file){
 assert(typeof file==='string'&&file.length&&!/[\\:\x00-\x1f]/.test(file)&&!isAbsolute(file)&&!win32.isAbsolute(file),'Invalid relative package path');
 assert(file.split('/').every(p=>p&&p!=='.'&&p!=='..'),'Package path traversal');
 const absolute=resolve(root,file);assert(absolute.startsWith(resolve(root)+sep),'Package path escaped root');return absolute;
}
export function assertP3Manifests(sm,dm){
 for(const [key,value] of Object.entries(P3_DELIVERY_PROFILE)){assert.equal(sm[key],value,'source '+key);assert.equal(dm[key],value,'SQL '+key);}
 assert.equal(sm.sourceCommit,dm.sourceCommit);assert.equal(typeof sm.sourceDirty,'boolean');assert.equal(sm.sourceDirty,dm.sourceDirty);
 assert.match(sm.sourceCommit,/^[a-f0-9]{40}$/);assert.match(sm.sourceSnapshotSha256,/^[a-f0-9]{64}$/);assert.equal(sm.sourceSnapshotSha256,dm.sourceSnapshotSha256);
 for(const m of [sm,dm])assert(m.files&&typeof m.files==='object'&&Object.keys(m.files).length>0,'Empty file manifest');
 assert.equal(hash(Object.entries(sm.files).sort(([a],[b])=>a.localeCompare(b,'en')).map(([file,sha])=>`${sha}  ${file}\n`).join('')),sm.sourceSnapshotSha256,'Source snapshot digest');
}
export async function verifyManifest(root,manifest){
 const canonical=await realpath(root);
 for(const [file,sha] of Object.entries(manifest.files)){
  const path=containedPath(root,file);assert((await realpath(path)).startsWith(canonical+sep),'Manifest symlink escaped package');
  assert.match(sha,/^[a-f0-9]{64}$/);assert.equal(hash(await readFile(path)),sha,file);
 }
}
