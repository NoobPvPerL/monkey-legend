import {fixture} from './p3-fixture';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import {initialGState} from '../../packages/game-core/src/p3-g-state';
import {dispatch,validateState} from '../../packages/game-core/src/index';
import type {Command,GameState} from '../../packages/game-core/src/types';
import {expect} from 'vitest';
let serial=0;
/** Controlled mid-game G fixture. New-game factories are tested separately. */
export function gFixture(ids=['character-021','character-048','character-025','character-031']):GameState {
 const s=fixture('web-v0.1.17',['character-003','character-048','character-025','character-031']);s.version='web-v0.1.18';s.stage3!.g=initialGState();
 const data=runtimeForVersion(s.version);for(let a=0;a<4;a++){const c=data.characters[ids[a] as keyof typeof data.characters];s.players[a].character=c.id;s.players[a].hp=c.hp;s.players[a].maxHp=c.hp;s.players[a].faction=c.faction;}
 validateState(s);return s;
}
export function gRun(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1){const cmd={id:`g-real-${++serial}`,revision:s.revision,actor:s.choice?.actor??s.active,...body} as Command,r=dispatch(s,cmd,at);expect(r.ok,r.error).toBe(ok);if(!ok)expect(r.state).toEqual(s);else validateState(r.state);return r.state;}
export function gDrain(s:GameState){for(let i=0;s.choice&&i<50;i++)s=gRun(s,{type:'choose',choice:s.choice.id,accept:false,...(s.choice.count?{cards:s.players[s.choice.actor].hand.slice(0,s.choice.count)}:{})});expect(s.choice).toBeNull();return s;}
