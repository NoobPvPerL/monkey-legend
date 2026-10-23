// Use an installed Playwright module, or the caller's bundled runtime via a file URL.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL(process.env.P3_REVIEW_URL??'http://127.0.0.1:5188');
if(base.protocol!=='http:'||!['127.0.0.1','localhost'].includes(base.hostname))throw Error('This verifier only permits a local HTTP review server');
const browser=await chromium.launch({headless:true,...(process.env.P3_REVIEW_BROWSER?{executablePath:process.env.P3_REVIEW_BROWSER}:{})});
const report={scope:'Actual local OnlineBoard clicks and core dispatch using controlled C-F scenarios. Headless Edge viewport emulation, not physical mobile, production or user acceptance.',screenshots:[],flows:[],errors:[]};
const names=['c-feather','c-feather-fail','c-primitive','d-dragon','d-clan','d-encourage','e-gas','e-escape','e-highest','f-execute','f-tenacity','f-monkey5','f-home','f-self','f-sting','f-bccb'];
let page,scenario,viewportName;
const state=()=>page.evaluate(()=>window.__p3Review.state);
async function closeToast(){const b=page.getByRole('button',{name:'关闭动作提示',exact:true});if(await b.count())await b.click();}
async function act(name){const rev=(await state()).revision;await page.getByRole('button',{name,exact:typeof name==='string'}).click();await page.waitForFunction(r=>window.__p3Review?.state.revision>r||window.__p3Review?.error,rev,{timeout:4000});assert.equal(await page.evaluate(()=>window.__p3Review.error),'');await closeToast();}
async function capture(suffix){await closeToast();const path=`artifacts/p3-batch-${scenario[0]}/${scenario.slice(2)}-${suffix}-${viewportName}.png`,png=await page.screenshot({path}),metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,actionsRect:(()=>{const r=document.querySelector('.compact-actions').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()}));assert.equal(metrics.scrollWidth,metrics.width);report.screenshots.push({scenario,viewport:viewportName,path,sha256:createHash('sha256').update(png).digest('hex'),bytes:png.length,...metrics});}
async function selectCard(n=0){await page.locator('.compact-card').nth(n).click();}
async function chooseTarget(n){await page.locator('.compact-player').nth(n).getByRole('button',{name:'选择目标',exact:true}).click();}
async function play(n=1){await selectCard();await chooseTarget(n);await act(/^确认出牌/);}
async function moveChoice(){const cell=(await state()).choice.cells[0],rev=(await state()).revision;await closeToast();await page.getByRole('gridcell',{name:new RegExp('^'+cell+' ')}).click();await page.waitForFunction(r=>window.__p3Review.state.revision>r||window.__p3Review.error,rev,{timeout:4000});assert.equal(await page.evaluate(()=>window.__p3Review.error),'');await closeToast();}
async function discardAllRequired(){const count=(await state()).choice.count;for(let i=0;i<count;i++)await selectCard(i);await act(/^确认弃置/);}
try{
 for(const b of ['c','d','e','f'])await mkdir('artifacts/p3-batch-'+b,{recursive:true});
 for(const [v,size] of [['mobile',{width:390,height:844}],['desktop',{width:1200,height:900}]])for(const name of names){
  scenario=name;viewportName=v;page=await browser.newPage({viewport:size});page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('/review?scenario='+scenario,base).href);await page.locator('.compact-player').first().waitFor();await closeToast();
  assert.deepEqual(errors,[]);const initial=await state();await capture('start');
  if(scenario==='c-feather'){
   await act('手长 · 0 AP');assert((await state()).stage3.c.feather[0]);await selectCard();assert.equal(await page.locator('.compact-player').nth(3).getByRole('button',{name:'选择目标'}).count(),0);await chooseTarget(1);await capture('target');await act(/^确认出牌/);assert.equal((await state()).players[1].hp,4);
  }else if(scenario==='c-feather-fail'){
   await act(/^移动 ·/);const s=await state();assert(s.stage3.c.blocked[0]);assert.equal(s.movement,null);assert.equal(s.players[0].ap,12);
  }else if(scenario==='c-primitive'){
   assert.equal(initial.players[0].hp,2);await act('你要不要吃 · 免费判定');assert.equal((await state()).players[0].hp,3);
  }else if(scenario==='d-dragon'){
   await selectCard();await actSelection('变 · 当作躲避球 · 总价2AP');await chooseTarget(1);await capture('target');await act(/^确认转换躲避球/);const s=await state();assert.equal(s.players[0].ap,10);assert.equal(s.players[1].hp,4);
  }else if(scenario==='d-clan'){
   await selectCard();assert(await page.getByRole('button',{name:'弃全部手牌 · 鸡犬升天 · 0 AP',exact:true}).isVisible());await act('弃全部手牌 · 鸡犬升天 · 0 AP');const s=await state();assert.equal(s.players[0].hand.length,0);assert.equal(s.players[0].ap,14);assert.equal(s.players[2].ap,14);
  }else if(scenario==='d-encourage'){
   await act('鼓励队友 · 免费判定');assert.equal((await state()).choice.kind,'encourage-discard');assert.equal((await state()).choice.actor,1);await capture('discard');await discardAllRequired();assert.equal((await state()).players[1].hand.length,0);
  }else if(scenario==='e-gas'){
   await act('释放毒气 · 1 AP');assert.equal((await state()).choice.kind,'move-consent');await capture('consent');await act('拒绝位移');assert.equal((await state()).players[1].cell,initial.players[1].cell);assert.equal((await state()).choice.kind,'force-step');await act('使用首个合法方向');assert.equal((await state()).choice.kind,'egg-move');await capture('egg');await moveChoice();
   for(let i=0;(await state()).choice&&i<12;i++){const c=(await state()).choice;if(c.kind==='force-step')await act('使用首个合法方向');else if(c.kind==='egg-move')await act('放弃反应移动');else if(c.kind==='move-consent')await act('拒绝位移');else throw Error('Unexpected gas response '+c.kind);}
   assert.equal((await state()).choice,null);assert.equal((await state()).players[0].ap,11);
  }else if(scenario==='e-escape'){
   await page.getByLabel('逃生演习目标地区',{exact:true}).selectOption('教学楼');await act('逃生演习 · 2 AP');await capture('direction');
   for(let i=0;(await state()).choice&&i<12;i++){const c=(await state()).choice;if(c.kind==='force-step')await act('使用首个合法方向');else if(c.kind==='egg-move')await act('放弃反应移动');else if(c.kind==='move-consent')await act('同意本次位移');else throw Error('Unexpected escape response '+c.kind);}
   const s=await state();assert.equal(s.choice,null);assert(s.stage3.e.escapeUsed[0]);assert.equal(s.players[0].ap,10);assert.equal(s.players[0].hp,initial.players[0].hp);assert(s.players.some((p,i)=>p.hp<initial.players[i].hp));
  }else if(scenario==='e-highest'){
   await act('结束行动 →');assert.equal((await state()).choice.kind,'force-step');await capture('direction');await act('使用首个合法方向');assert.notEqual((await state()).players[1].cell,initial.players[1].cell);assert.equal((await state()).players[0].cell,initial.players[0].cell);
  }else if(scenario==='f-execute'){
   await selectCard();await page.getByLabel('斩杀目标',{exact:true}).selectOption('1');await capture('target');await act('弃选中手牌 · 斩杀 · 0 AP');const s=await state();assert.equal(s.players[1].hp,0);assert.equal(s.stage3.deathTurns[1],-1);assert.equal(s.players[0].hand.length,0);
  }else if(scenario==='f-tenacity'){
   await selectCard();assert(await page.getByRole('button',{name:/^岩浆之力/}).isVisible());await act(/^岩浆之力/);assert.equal((await state()).choice.kind,'f-tenacity');await capture('tenacity');await page.getByLabel('坚韧抵挡点数',{exact:true}).selectOption('1');await act('确认坚韧');const s=await state();assert.equal(s.players[1].hp,3);assert.equal(s.players[1].maxHp,3);assert.equal(s.players[0].ap,10);
  }else if(scenario==='f-monkey5'){
   await play(1);assert.equal((await state()).players[0].hp,3);assert.equal((await state()).players[0].maxHp,2);assert((await page.locator('.compact-player').first().innerText()).includes('∞'));
  }else if(scenario==='f-home'){
   await play(1);const s=await state();assert(s.stage3.f.home[1]);assert.equal(s.players[1].hp,3);
  }else if(scenario==='f-self'){
   await act('自虐 · 免费判定');assert.equal((await state()).choice.kind,'f-discard');await capture('discard');await discardAllRequired();assert.equal((await state()).choice.actor,3);await discardAllRequired();assert.equal((await state()).players[1].hand.length,0);assert.equal((await state()).players[3].hand.length,0);
  }else if(scenario==='f-sting'){
   await act('毒蜇 · 免费判定');const s=await state();assert.equal(s.players[0].hp,3);assert.equal(s.players[0].maxHp,3);assert.equal(s.players[0].shield,2);
  }else if(scenario==='f-bccb'){
   await act('bccb · 免费判定');const s=await state();assert.equal(s.players[1].hp,2);assert.equal(s.players[1].maxHp,4);assert.equal(s.players[1].ap,14);assert.equal(s.players[1].hand.length,2);
  }
  await capture('result');assert.deepEqual(errors,[]);const final=await page.evaluate(()=>window.__p3Review);assert.equal(final.error,'');assert(final.intents.length>0);report.flows.push({scenario,viewport:viewportName,initial,steps:final.intents,final:final.state});console.log(JSON.stringify({scenario,viewport:viewportName,commands:final.intents.length,result:'passed'}));await page.close();page=null;
 }
}catch(e){report.errors.push({scenario,viewport:viewportName,error:e.stack});console.error(e);if(page){report.failedFlow=await page.evaluate(()=>window.__p3Review);console.error(JSON.stringify({events:report.failedFlow.state.events.slice(-9),dice:report.failedFlow.state.random.dice}));}if(page)await capture('failed-attempt').catch(()=>{});process.exitCode=1;}
finally{await browser.close();await writeFile('artifacts/p3-batch-f/cdef-browser-flows.json',JSON.stringify(report,null,2)+'\n');await writeFile('artifacts/p3-batch-f/cdef-browser-review.json',JSON.stringify({...report,flows:report.flows.map(f=>({scenario:f.scenario,viewport:f.viewport,commands:f.steps.length,states:f.steps.map(x=>({revision:x.expected.revision,phase:x.expected.phase,choice:x.expected.choice?.kind,players:x.expected.players.map(p=>({seat:p.seat,hp:p.hp,maxHp:p.maxHp,ap:p.ap,cell:p.cell,handCount:p.hand.length}))}))}))},null,2)+'\n');}
async function actSelection(name){await page.getByRole('button',{name,exact:true}).click();}
