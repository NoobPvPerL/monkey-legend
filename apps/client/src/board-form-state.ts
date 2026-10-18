import type {Snapshot} from '../../../packages/online/src/protocol';
export function formContext(s:Snapshot):string {
 const g=s.game!;return [s.roomId,s.matchId,s.memberId,s.epoch,s.seat,g.stage3?.turn,g.phase,g.choice?.id,g.choice?.actor].join(':');
}
