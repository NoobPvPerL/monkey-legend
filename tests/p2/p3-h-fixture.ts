import {gFixture} from './p3-g-fixture';
import {initialHState,hObserveHp} from '../../packages/game-core/src/p3-h-state';
import {runtimeForVersion,sourceCatalogForVersion,mapForVersion,environmentForVersion,ruleManifest,characterTraitsForVersion,classicLocationPolicy} from '../../packages/game-data/src/index';
import {validateState} from '../../packages/game-core/src/index';
export function hFixture(ids=['character-039','character-048','character-025','character-031']){
 const s=gFixture();s.version='web-v0.1.19';s.stage3!.h=initialHState();const d=runtimeForVersion(s.version);
 for(let a=0;a<4;a++){const c=d.characters[ids[a] as keyof typeof d.characters];s.players[a].character=c.id;s.players[a].hp=c.hp;s.players[a].maxHp=c.hp;s.players[a].faction=c.faction;}
 hObserveHp(s,true);validateState(s);return s;
}
export function hProfile(previous:any){const v='web-v0.1.19';return {...previous,manifest:ruleManifest(v),mapDefinition:mapForVersion(v),environment:environmentForVersion(v),sourceCatalog:sourceCatalogForVersion(v),runtimeData:runtimeForVersion(v),locationPolicy:classicLocationPolicy(v),characterTraits:Object.fromEntries(runtimeForVersion(v).characterIds.map(id=>[id,characterTraitsForVersion(v,id)])),p3:{...previous.p3,batchHDevelopment:true}};}
