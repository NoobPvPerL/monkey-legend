import {expect,it,vi} from 'vitest';
import {createGameAudio} from '../../apps/client/src/game-audio';
function fixture(state='suspended'){
 const target=new EventTarget(),tones:{wave:string;frequency:number;start:number;stop:number}[]=[];
 const context={state,currentTime:10,destination:{},resume:vi.fn(async()=>{context.state='running';}),close:vi.fn(async()=>{context.state='closed';}),
  createOscillator:()=>{const tone={wave:'',frequency:0,start:0,stop:0};tones.push(tone);return {set type(v:string){tone.wave=v;},frequency:{setValueAtTime(v:number){tone.frequency=v;},exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),start(){tone.start++;},stop(t:number){tone.stop=t;}};},
  createGain:()=>({connect:vi.fn(),gain:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()}})};
 const create=vi.fn(()=>context as unknown as AudioContext);return {target,tones,context,create};
}
it('defaults on without a toggle and unlocks on the first normal pointer interaction',async()=>{
 const f=fixture(),audio=createGameAudio(f.target,f.create);audio.play(false,true);expect(f.create).not.toHaveBeenCalled();expect(f.tones).toHaveLength(0);
 f.target.dispatchEvent(new Event('pointerdown'));await Promise.resolve();audio.play(false,true);
 expect(f.create).toHaveBeenCalledTimes(1);expect(f.context.resume).toHaveBeenCalledTimes(1);expect(f.tones).toEqual([{wave:'sine',frequency:740,start:1,stop:10.2}]);audio.dispose();
});
it('uses existing browser activation immediately and preserves damage/routine sound cues',()=>{
 const f=fixture('running'),audio=createGameAudio(f.target,f.create,true);audio.play(true,false);audio.play(false,false);
 expect(f.context.resume).not.toHaveBeenCalled();expect(f.tones.map(t=>[t.wave,t.frequency])).toEqual([['triangle',220],['sine',520]]);audio.dispose();
});
it('retries a rejected resume on the next keyboard gesture and after an interrupted context',async()=>{
 const f=fixture();f.context.resume.mockImplementationOnce(async()=>{throw Error('blocked');});const audio=createGameAudio(f.target,f.create,true);await Promise.resolve();audio.play(false,true);expect(f.tones).toHaveLength(0);
 f.target.dispatchEvent(new Event('keydown'));await Promise.resolve();audio.play(false,true);expect(f.context.resume).toHaveBeenCalledTimes(2);expect(f.tones).toHaveLength(1);
 f.context.state='interrupted';f.target.dispatchEvent(new Event('pointerdown'));await Promise.resolve();expect(f.context.resume).toHaveBeenCalledTimes(3);audio.dispose();
});
it('does not turn unsupported or failed audio into a game-blocking error',()=>{
 const f=fixture();f.create.mockImplementationOnce(()=>{throw Error('unsupported');});const audio=createGameAudio(f.target,f.create,true);
 expect(()=>audio.play(true,true)).not.toThrow();expect(()=>f.target.dispatchEvent(new Event('pointerdown'))).not.toThrow();audio.play(true,true);expect(f.tones).toHaveLength(1);audio.dispose();
});
it('removes gesture listeners and closes the context exactly once on exit',()=>{
 const f=fixture('running'),audio=createGameAudio(f.target,f.create,true);audio.dispose();audio.dispose();f.target.dispatchEvent(new Event('pointerdown'));f.target.dispatchEvent(new Event('keydown'));audio.play(false,true);
 expect(f.context.close).toHaveBeenCalledTimes(1);expect(f.create).toHaveBeenCalledTimes(1);expect(f.tones).toHaveLength(0);
});
