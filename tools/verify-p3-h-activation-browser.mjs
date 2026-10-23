import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const prefix=process.env.P3_H_REVIEW_PREFIX??'activation';assert(/^[a-z0-9-]+$/.test(prefix));
const base=new URL(process.env.P3_H_REVIEW_URL??'http://127.0.0.1:5189');
if(base.protocol!=='http:'||!['127.0.0.1','localhost'].includes(base.hostname))throw Error('Local HTTP candidate review only');
const browser=await chromium.launch({headless:true,...(process.env.P3_REVIEW_BROWSER?{executablePath:process.env.P3_REVIEW_BROWSER}:{})});
const report={scope:'Normal H TS draft/create factories rendered by production DraftBoard/OnlineBoard; controlled local seed, no hidden catalog/state injection. Headless viewport emulation, not cloud or physical mobile.',screenshots:[],flows:[],errors:[]};
try{for(const mode of ['ffa','team'])for(const [view,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1200,height:900}]]){
 const p=await browser.newPage({viewport});p.setDefaultTimeout(7000);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(new URL('/review?mode='+mode,base).href);await p.getByRole('button',{name:'选择三幻神',exact:true}).waitFor();
 const shot=async name=>{const path=`artifacts/p3-batch-h/${prefix}-${mode}-${name}-${view}.png`,png=await p.screenshot({path}),m=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}));assert.equal(m.scrollWidth,m.width);report.screenshots.push({path,mode,viewport:view,...m,bytes:png.length,sha256:createHash('sha256').update(png).digest('hex')});};
 const clean=async()=>{const b=p.getByRole('button',{name:'关闭动作提示',exact:true});if(await b.count())await b.click();};
 await shot('draft');await p.getByRole('button',{name:'选择三幻神',exact:true}).click();await p.getByRole('button',{name:'确认角色 · 三幻神',exact:true}).click();
 for(let i=0;i<3;i++){await p.locator('.draft-candidate').first().click();await p.getByRole('button',{name:/^确认角色 ·/}).click();}
 await p.waitForFunction(()=>window.__hActivation?.game?.choice?.kind==='h-birth');await clean();const before=await p.evaluate(()=>window.__hActivation.game);assert(before.players.every(x=>x.hand.length===0));await shot('birth');
 const cell=before.choice.cells[0];await p.getByRole('gridcell',{name:new RegExp('^'+cell+' ')}).click();await p.waitForFunction(()=>window.__hActivation.game.choice?.kind!=='h-birth');await clean();const born=await p.evaluate(()=>window.__hActivation.game);assert(born.players.every(x=>x.hand.length===4));assert.equal(born.version,'web-v0.1.19');await shot('started');
 await p.getByRole('button',{name:'规则',exact:true}).click();assert((await p.getByRole('dialog').innerText()).includes('本版52角色'));assert((await p.getByRole('dialog').innerText()).includes('已确认规则'));await shot('rules');
 await p.getByRole('dialog').getByRole('button',{name:/关闭/}).click();const a=born.players.findIndex(x=>x.character==='character-035');await p.locator('.compact-player').nth(a).locator('.compact-character').click();await p.getByRole('img',{name:'原始牌面参考'}).waitFor();await p.waitForFunction(()=>document.querySelector('.online-reference img')?.naturalWidth>0);await shot('reference');
 assert.deepEqual(errors,[]);const flow=await p.evaluate(()=>window.__hActivation);assert.equal(flow.error,'');report.flows.push({mode,viewport:view,...flow});await p.close();console.log(JSON.stringify({mode,view,events:flow.history.length,passed:true}));
}}catch(e){report.errors.push(e.stack);console.error(e);process.exitCode=1;}finally{await browser.close();await writeFile(`artifacts/p3-batch-h/${prefix}-browser-flows.json`,JSON.stringify(report,null,2)+'\n');await writeFile(`artifacts/p3-batch-h/${prefix}-browser-review.json`,JSON.stringify({...report,flows:report.flows.map(f=>({mode:f.mode,viewport:f.viewport,seed:f.seed,commands:f.history.length,characters:f.game.players.map(p=>p.character)}))},null,2)+'\n');}
