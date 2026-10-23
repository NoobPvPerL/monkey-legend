import {createHash} from 'node:crypto';

export const DATABASE_UPGRADE_BASES=Object.freeze([18,19,20,21,22,23,24,25,26,27,28,29]);
/** Pure SQL assembly shared by packaging and pre-build isolated validation. No I/O. */
export function databasePackagePlan(version,migrations,upgrade=false){
 const selected=migrations.filter(m=>/^\d{3}_.+\.sql$/.test(m.file)&&(!upgrade||Number(m.file.slice(0,3))>=5)).sort((a,b)=>a.file.localeCompare(b.file,'en'));
 if(!selected.length||selected.at(-1).file.slice(0,3)!=='030'||new Set(selected.map(m=>m.file)).size!==selected.length)throw Error('Expected unique migrations through030');
 if(selected.length!==(upgrade?26:31)||selected.some((m,i)=>Number(m.file.slice(0,3))!==i+(upgrade?5:0)))throw Error('Missing or duplicate migration revision in package input');
 let bundle='-- monkey-legend '+version+'; owner-only installation. Review README first.\nBEGIN;\n';
 if(upgrade)bundle+="DO $$ BEGIN IF coalesce(public.ml_health()->>'schemaVersion','') NOT IN ('1','2') THEN RAISE EXCEPTION 'Expected installed schema 1 or 2'; END IF; END $$;\n";
 for(const m of selected)bundle+='\n-- '+m.file+'\n'+m.body+'\n';
 const body=bundle.slice(bundle.indexOf('BEGIN;\n')+7),digest=createHash('sha256').update(body).digest('hex').slice(0,16),inner='$ml_install_'+digest+'$',outer='$ml_outer_'+digest+'$';
 if(body.includes(inner)||body.includes(outer))throw Error('SQL delimiter collision');
 const files={'install-one-statement.sql':`DO ${outer} BEGIN EXECUTE ${inner}${body}${inner}; END ${outer};\n`,'install.sql':bundle+'\nCOMMIT;\n'};
 if(upgrade)for(const base of DATABASE_UPGRADE_BASES){
  const after=selected.filter(m=>Number(m.file.slice(0,3))>base);if(!after.length)throw Error('Missing upgrade migrations after '+base);
  const body=after.map(m=>m.body).join('\n'),digest=createHash('sha256').update(body).digest('hex').slice(0,16),inner='$ml_body_'+digest+'$',outer='$ml_outer_'+digest+'$';
  if(body.includes(inner)||body.includes(outer))throw Error('Upgrade delimiter collision');
  files[`UPGRADE-FROM-${String(base).padStart(3,'0')}-ONE-STATEMENT.sql`]=`DO ${outer} BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<${base} THEN RAISE EXCEPTION 'Expected complete revision ${base} or later';END IF;EXECUTE ${inner}${body}${inner};END ${outer};\n`;
 }
 return {migrations:selected,files};
}
