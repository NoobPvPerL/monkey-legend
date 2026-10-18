import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createGame,publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import Stage4Controls from '../../apps/client/src/Stage4Controls';
import type {Stage4ControlProps} from '../../apps/client/src/Stage4Controls';
import type {CharacterId} from '../../packages/game-data/src/index';
import type {OnlineGame} from '../../packages/online/src/protocol';

function fixture(character:CharacterId){
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.9',seed:42,seats:[0,1,2,3],first:0,characters:[character,'character-031','character-026','character-044']},1000);
 s.phase='action';s.choice=null;s.queue=[];s.players[0].ap=0;
 s.players.forEach((p,i)=>p.cell=['r1c2','r1c3','r2c2','r2c3'][i]);
 return s;
}
function view(s:ReturnType<typeof fixture>):OnlineGame{return {...publicView(s,0),actions:{targets:{},steps:[],stage3:stage3Actions(s,0),stage4:stage4Actions(s,0)}};}
function render(game:OnlineGame,extra:Partial<Stage4ControlProps>={}){
 const no=()=>{};
 return renderToStaticMarkup(createElement(Stage4Controls,{game,seat:0,busy:false,now:1000,selected:null,targets:[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[],send:no,locationMode:null,setLocationMode:no,mode:null,setMode:no,...extra}));
}
it('JJ remains present at zero AP with a card selected; spent JJ stays visibly disabled',()=>{
 const s=fixture('character-003');s.deck=s.deck.filter(c=>c!=='basic-039#01');s.players[0].hand.push('basic-039#01');
 expect(render(view(s),{selected:'basic-039#01'})).toContain('懒得喷 · 0 AP');
 s.stage3!.jjUsed[0]=true;
 expect(render(view(s),{selected:'basic-039#01'})).toMatch(/disabled=""[^>]*>懒得喷 · 本回合已发动/);
});
it('keeps West direction controls alongside selected-card actions without duplicating them',()=>{
 const s=fixture('character-040');s.deck=s.deck.filter(c=>c!=='basic-039#01');s.players[0].hand.push('basic-039#01');
 const html=render(view(s),{selected:'basic-039#01'});
 expect(html.match(/aria-label="西帝汶声明移动方向"/g)).toHaveLength(1);
 expect(html).toContain('确认出牌');
});
it('conversion exposes a direction selector, while untriggered and other-player skills remain gated',()=>{
 const s=fixture('character-023');s.players[0].ap=10;s.deck=s.deck.filter(c=>c!=='basic-039#01');s.players[0].hand.push('basic-039#01');
 expect(render(view(s),{selected:'basic-039#01',asElbow:true,targets:[1]})).toContain('class="character-skill-control"');
 const jj=fixture('character-003');jj.active=1;
 expect(render(view(jj))).not.toContain('懒得喷 · 0 AP');
 jj.active=0;jj.phase='choice';jj.choice={id:2,actor:0,kind:'easy',deadline:31000,paused:true};
 expect(render(view(jj))).toContain('付1 AP · 反制');expect(render(view(jj))).not.toContain('懒得喷 · 0 AP');
});
it('bread activation and its target confirmation remain available in the ordinary action group',()=>{
 const s=fixture('character-003');s.stage3!.equipment[0].push('basic-054#01');s.stage3!.equipmentSources['basic-054#01']={origin:'equipment',actor:0,faction:s.players[0].faction,roleModifiers:[]};
 const game=view(s);expect(game.actions.stage3!.breadTargets.length).toBeGreaterThan(0);
 const html=render(game,{breadMode:true,targets:[1]});
 expect(html).toContain('面包黏稠');expect(html).toContain('令所选角色下次不能出牌');expect(html).toContain('取消技能');
});
