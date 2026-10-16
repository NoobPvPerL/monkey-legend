import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
export async function database(path?:string){
 const db=new PGlite(path);await db.waitReady;
 await db.exec('create role anon; create role authenticated;');
 for(const file of (await readdir('database/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('database/migrations/'+file,'utf8'));
 return db;
}
export const literal=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
// A synchronous PostgreSQL simple-query exchange lets the original synchronous C cases
// execute unchanged while every operation is independently evaluated by PostgreSQL.
export function scalar<T=unknown>(db:PGlite,sql:string):T{
 const bytes=Buffer.from(sql+'\0'),request=Buffer.alloc(bytes.length+5);request[0]=81;request.writeInt32BE(bytes.length+4,1);bytes.copy(request,5);
 const out=Buffer.from(db.execProtocolRawSync(request));let answer:unknown=null;
 for(let at=0;at<out.length;){const tag=String.fromCharCode(out[at]),len=out.readInt32BE(at+1),start=at+5;
  if(tag==='D'){const size=out.readInt32BE(start+2);if(size>=0){const text=out.subarray(start+6,start+6+size).toString();answer=text?JSON.parse(text):null;}}
  if(tag==='E'){const fields=out.subarray(start,at+1+len).toString().split('\0');throw Error(fields.find(x=>x.startsWith('M'))?.slice(1)??'PostgreSQL error');}
  at+=len+1;
 }
 return answer as T;
}
