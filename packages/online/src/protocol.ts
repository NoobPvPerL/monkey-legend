import {z} from 'zod';
import type {publicView} from '../../game-core/src/index';

export type OnlineGame = ReturnType<typeof publicView> & {actions:{targets:Record<string,number[]>;steps:string[]}};
export interface Member {id:string;seat:number;name:string;ready:boolean;online:boolean}
export interface Snapshot {
 protocol:1;roomId:string;code:string;status:'lobby'|'playing'|'finished'|'closed';mode:'ffa'|'team';host:string|null;
 members:(Member|null)[];roomRevision:number;matchId:string|null;seat:number;memberId:string;epoch:number;serverTime:number;game:OnlineGame|null;
}
export interface Reply {ok:boolean;error?:string;duplicate?:boolean;left?:boolean;snapshot?:Snapshot}
export type Rpc = (name:'ml_room'|'ml_health'|'ml_maintenance',args:Record<string,unknown>)=>Promise<unknown>;
const name=z.string().trim().min(1).max(24).refine(s=>!/[\x00-\x1f\x7f]/.test(s),'玩家名不能包含控制字符');
const token=z.string().regex(/^[a-f0-9]{64}$/);
const requestId=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const revision=z.number().int().nonnegative();
export const attachSchema=z.discriminatedUnion('op',[
 z.strictObject({op:z.literal('create'),name,token,requestId}),
 z.strictObject({op:z.literal('join'),name,token,requestId,code:z.string().regex(/^\d{4}$/)}),
 z.strictObject({op:z.literal('resume'),name,token,roomId:z.uuid()}),
]);
export type Attachment=z.infer<typeof attachSchema>;
export interface Credential {name:string;token:string;roomId:string}
const intent=z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('play'),card:z.string().max(40),targets:z.array(z.number().int().min(0).max(3)).max(2)}),
 z.strictObject({type:z.literal('move')}),z.strictObject({type:z.literal('stop')}),z.strictObject({type:z.literal('end')}),
 z.strictObject({type:z.literal('step'),path:z.array(z.string().max(4)).min(1).max(6)}),
 z.strictObject({type:z.literal('choose'),choice:revision,accept:z.boolean().optional(),card:z.string().max(40).nullable().optional(),cell:z.string().max(4).nullable().optional(),cards:z.array(z.string().max(40)).max(64).optional()}),
]);
export type Intent=z.infer<typeof intent>;
export const commandSchema=z.discriminatedUnion('op',[
 z.strictObject({op:z.literal('ready'),requestId,roomRevision:revision,ready:z.boolean()}),
 z.strictObject({op:z.literal('mode'),requestId,roomRevision:revision,mode:z.enum(['ffa','team'])}),
 z.strictObject({op:z.literal('start'),requestId,roomRevision:revision}),
 z.strictObject({op:z.literal('leave'),requestId,roomRevision:revision}),
 z.strictObject({op:z.literal('game'),requestId,matchId:z.uuid(),revision,intent}),
]);
export type OnlineCommand=z.infer<typeof commandSchema>;
