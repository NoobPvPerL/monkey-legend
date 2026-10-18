/** Enabled by default. Browser activation gates audio, never game commands. */
export function createGameAudio(target:EventTarget,create:()=>AudioContext,autoStart=false){
 let context:AudioContext|null=null,disposed=false;
 const activate=()=>{
  if(disposed)return;
  try{context??=create();if(context.state!=='running'&&context.state!=='closed')void context.resume().catch(()=>{});}catch{/* Retry on the next real interaction. */}
 };
 target.addEventListener('pointerdown',activate,{capture:true,passive:true});
 target.addEventListener('keydown',activate,{capture:true});
 if(autoStart)activate();
 return {
  play(hit:boolean,urgent:boolean){
   if(disposed||context?.state!=='running')return;
   try{
    const oscillator=context.createOscillator(),gain=context.createGain();oscillator.connect(gain);gain.connect(context.destination);
    oscillator.type=hit?'triangle':'sine';oscillator.frequency.setValueAtTime(hit?220:urgent?740:520,context.currentTime);
    if(hit)oscillator.frequency.exponentialRampToValueAtTime(80,context.currentTime+.16);
    gain.gain.setValueAtTime(.045,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.18);
    oscillator.start();oscillator.stop(context.currentTime+.2);
   }catch{/* Unsupported or interrupted audio must not block the board. */}
  },
  dispose(){
   disposed=true;target.removeEventListener('pointerdown',activate,true);target.removeEventListener('keydown',activate,true);
   if(context&&context.state!=='closed')void context.close().catch(()=>{});context=null;
  },
 };
}
