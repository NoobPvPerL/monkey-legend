import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import DraftBoard from '../../apps/client/src/DraftBoard';
import {createDraft,draftView} from '../../packages/game-core/src/draft';
import {sourceCatalogForVersion,runtimeForVersion} from '../../packages/game-data/src/index';
import {draftPickSchema} from '../../packages/online/src/draft-protocol';
import {commandSchema} from '../../packages/online/src/protocol';
const catalog=sourceCatalogForVersion('web-v0.1.4').characters,ids=Object.keys(catalog);
const members=Array.from({length:4},(_,i)=>({id:'p'+i,seat:i,name:'玩家'+i,ready:false,online:true}));
const s=createDraft({mode:'ffa',order:[2,3,0,1],teams:['S1','S2','S3','S4'],pools:Object.fromEntries(members.map(m=>['S'+(m.seat+1),[...ids]])),random:{seed:42,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false}},1000);
const render=(seat:number|null,serverTime=1000,busy=false)=>renderToStaticMarkup(createElement(DraftBoard,{draft:draftView(s,seat),seat,members,serverTime,busy,send:()=>{}}));
it('renders three source-backed choices for the owner and spectator while other players see none',()=>{
 const own=render(2),watch=render(null),other=render(0);
 for(const id of s.offer!.candidates){expect(own).toContain(catalog[id].name);expect(own).toContain(catalog[id].spawnRegion);expect(watch).toContain(catalog[id].name);expect(other).not.toContain('选择'+catalog[id].name);}
 expect(own).toContain('30s');expect(own).toContain('确认角色');expect(watch).not.toContain('确认角色');expect(other).not.toContain('本次三个候选角色');expect(other).toContain('其他玩家的候选仅本人和观众可见');
});
it('disables the three choices at the server deadline or while waiting for acknowledgement',()=>{
 for(const html of [render(2,31000),render(2,1000,true),render(null)])expect((html.match(/class="draft-candidate[^>]+disabled=""/g)??[])).toHaveLength(3);
 expect(render(2,31000)).toContain('选择时间已结束，正在同步');
});
it('draft intent carries only the choice identity and never expands the currently active room protocol',()=>{
 const intent={type:'draft-pick',offer:1,character:s.offer!.candidates[0]};expect(draftPickSchema.safeParse(intent).success).toBe(true);
 for(const extra of [{actor:2},{revision:99},{random:{seed:1}},{deadline:99999},{pool:ids}])expect(draftPickSchema.safeParse({...intent,...extra}).success).toBe(false);
 expect(commandSchema.safeParse({op:'game',requestId:'pick',matchId:'00000000-0000-4000-8000-000000000000',revision:0,intent}).success).toBe(false);
});

it('shows established web abilities for existing characters rather than silently reverting to printed text',()=>{
 expect(s.offer!.candidates).toContain('character-037');expect(render(2)).toContain(runtimeForVersion('web-v0.1.4').characters['character-037'].text);
});
