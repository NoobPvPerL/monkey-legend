import {z} from 'zod';
import type {publicView} from '../../game-core/src/index';
import type {stage4Actions} from '../../game-core/src/stage4-view';
import type {stage3Actions} from '../../game-core/src/stage3-engine';
import type {DraftView} from '../../game-core/src/draft';

export type OnlineGame = ReturnType<typeof publicView> & {actions:{targets:Record<string,number[]>;steps:string[];stage3?:ReturnType<typeof stage3Actions>;stage4?:ReturnType<typeof stage4Actions>}};
export interface Member {id:string;seat:number;name:string;ready:boolean;online:boolean}
export interface Spectator {id:string;name:string;online:boolean}
export interface Snapshot {
 protocol:1;roomId:string;code:string;status:'lobby'|'drafting'|'playing'|'finished'|'closed';mode:'ffa'|'team';host:string|null;
 members:(Member|null)[];roomRevision:number;matchId:string|null;seat:number;memberId:string;epoch:number;serverTime:number;game:OnlineGame|null;
 role?:'player';spectators?:Spectator[];
 draft?:DraftView;
}
export interface WatchSnapshot extends Omit<Snapshot,'seat'|'role'> {role:'spectator';seat:null}
export type RoomSnapshot=Snapshot|WatchSnapshot;
export interface Reply<S=Snapshot> {ok:boolean;error?:string;duplicate?:boolean;left?:boolean;snapshot?:S}
export type RoomReply=Reply<RoomSnapshot>;
export interface ChatMessage {seq:number;authorId:string;name:string;kind:'player'|'spectator';seat:number|null;text:string;createdAt:number}
export interface ChatReply {ok:boolean;error?:string;duplicate?:boolean;message?:ChatMessage;messages?:ChatMessage[];lastSeq?:number}
export interface ChatPacket {history:boolean;messages:ChatMessage[];lastSeq:number}
export type Rpc = (name:'ml_room'|'ml_health'|'ml_maintenance'|'ml_watch'|'ml_chat',args:Record<string,unknown>)=>Promise<unknown>;
const name=z.string().trim().min(1).max(24).refine(s=>!/[\x00-\x1f\x7f]/.test(s),'玩家名不能包含控制字符');
const token=z.string().regex(/^[a-f0-9]{64}$/);
const requestId=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const revision=z.number().int().nonnegative();
export const attachSchema=z.discriminatedUnion('op',[
 z.strictObject({op:z.literal('create'),name,token,requestId}),
 z.strictObject({op:z.literal('join'),name,token,requestId,code:z.string().regex(/^\d{4}$/)}),
 z.strictObject({op:z.literal('resume'),name,token,roomId:z.uuid()}),
 z.strictObject({op:z.literal('watch'),name,token,requestId,code:z.string().regex(/^\d{4}$/)}),
 z.strictObject({op:z.literal('watch-resume'),name,token,roomId:z.uuid()}),
]);
export type Attachment=z.infer<typeof attachSchema>;
export interface Credential {name:string;token:string;roomId:string;kind?:'player'|'spectator'}
const intent=z.discriminatedUnion('type',[
 z.strictObject({type:z.literal('play'),card:z.string().max(40),targets:z.array(z.number().int().min(0).max(3)).max(3),as:z.enum(['elbow','dodge']).optional(),direction:z.enum(['up','right','down','left']).optional(),replacement:z.string().max(40).optional(),replacements:z.array(z.string().max(40)).max(2).optional(),x:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),region:z.string().max(30).optional(),take:z.enum(['hand','equipment']).optional(),item:z.string().max(40).optional(),copy:z.string().max(40).optional(),northGroup:z.enum(['north','others']).optional()}),
 z.strictObject({type:z.literal('location'),kind:z.enum(['ship','commute']),cell:z.string().max(4)}),
 z.strictObject({type:z.literal('move'),cell:z.string().max(4).optional(),direction:z.enum(['up','right','down','left']).optional()}),z.strictObject({type:z.literal('stop')}),z.strictObject({type:z.literal('end')}),
 z.strictObject({type:z.literal('step'),path:z.array(z.string().max(4)).min(1).max(6)}),
 z.strictObject({type:z.literal('choose'),choice:revision,accept:z.boolean().optional(),card:z.string().max(40).nullable().optional(),cell:z.string().max(4).nullable().optional(),cards:z.array(z.string().max(40)).max(191).optional(),target:z.number().int().min(0).max(3).optional(),targets:z.array(z.number().int().min(0).max(3)).max(2).optional(),action:z.enum(['draw','steal','ap']).optional(),option:z.string().max(100).optional(),guess:z.number().int().min(1).max(6).optional()}),
 z.strictObject({type:z.literal('skill'),kind:z.enum(['ren','cooperate','circle','freeze','dog','jj','bread','revival-quote','quote-cost','watch','flight','gift','terrain','mayi','feather','clan','gas','escape','execute','magma']),direction:z.enum(['up','right','down','left']).optional(),region:z.string().max(20).optional(),target:z.number().int().min(0).max(3).optional(),card:z.string().max(40).optional(),cell:z.string().max(4).optional(),cards:z.array(z.string().max(40)).max(191).optional(),accept:z.boolean().optional()}),
]);
export type Intent=z.infer<typeof intent>;
export const commandSchema=z.discriminatedUnion('op',[
 z.strictObject({op:z.literal('ready'),requestId,roomRevision:revision,ready:z.boolean()}),
 z.strictObject({op:z.literal('mode'),requestId,roomRevision:revision,mode:z.enum(['ffa','team'])}),
 z.strictObject({op:z.literal('start'),requestId,roomRevision:revision}),
 z.strictObject({op:z.literal('leave'),requestId,roomRevision:revision}),
 z.strictObject({op:z.literal('watch-leave'),requestId}),
 z.strictObject({op:z.literal('game'),requestId,matchId:z.uuid(),revision,intent}),
 z.strictObject({op:z.literal('draft-pick'),requestId,matchId:z.uuid(),revision,offer:revision.positive(),character:z.string().regex(/^character-\d{3}$/)}),
]);
export type OnlineCommand=z.infer<typeof commandSchema>;
export const chatSchema=z.discriminatedUnion('op',[
 z.strictObject({op:z.literal('list'),after:revision.max(Number.MAX_SAFE_INTEGER).optional()}),
 z.strictObject({op:z.literal('send'),requestId,text:z.string().trim().min(1).refine(s=>Array.from(s).length<=200&&!/[\x00-\x1f\x7f]/.test(s),'消息须为1至200字，不含控制字符')}),
]);
export type ChatCommand=z.infer<typeof chatSchema>;
