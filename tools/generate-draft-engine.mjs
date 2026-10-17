import {readFile,writeFile} from 'node:fs/promises';
const body=(await readFile('database/engine/draft.sql','utf8')).replaceAll('\r\n','\n');
const sql=`-- Stage 3 private draft foundation. No room, profile, default rule or public RPC changes.
DO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<12 THEN RAISE EXCEPTION 'Apply 012 before 013'; END IF; END $$;
${body}
revoke all on all functions in schema ml_private from public;
DO $$ declare r text; begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;
`;
const path='database/migrations/013_draft_foundation.sql';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==sql)throw Error('Draft foundation SQL differs');}else await writeFile(path,sql);
console.log('013: private draft state machine; faction configuration and complete character rules required before room activation.');
