import {useEffect,useRef} from 'react';

/** Mouse browsing only: touch scrolling and card click/keyboard actions stay native. */
export default function useHandScroll(){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const node=ref.current;if(!node)return;
  let gesture:{id:number;x:number;y:number;left:number;dragged:boolean}|null=null,suppressClick=false;
  const down=(e:PointerEvent)=>{
   if(e.pointerType!=='mouse'||e.button!==0)return;
   suppressClick=false;
   if(node.scrollWidth<=node.clientWidth)return;
   gesture={id:e.pointerId,x:e.clientX,y:e.clientY,left:node.scrollLeft,dragged:false};
  };
  const move=(e:PointerEvent)=>{
   if(!gesture||e.pointerId!==gesture.id)return;
   const dx=e.clientX-gesture.x;
   if(!gesture.dragged){
    if(Math.abs(dx)<6||Math.abs(dx)<Math.abs(e.clientY-gesture.y))return;
    gesture.dragged=true;node.setPointerCapture(e.pointerId);node.classList.add('is-dragging');
   }
   e.preventDefault();node.scrollLeft=gesture.left-dx;
  };
  const finish=(e:PointerEvent)=>{
   if(!gesture||e.pointerId!==gesture.id)return;
   suppressClick=gesture.dragged;gesture=null;node.classList.remove('is-dragging');
   if(node.hasPointerCapture(e.pointerId))node.releasePointerCapture(e.pointerId);
  };
  const click=(e:MouseEvent)=>{if(suppressClick&&e.detail!==0){suppressClick=false;e.preventDefault();e.stopPropagation();}};
  const drag=(e:DragEvent)=>e.preventDefault();
  const wheel=(e:WheelEvent)=>{
   if(e.ctrlKey||e.metaKey||node.scrollWidth<=node.clientWidth)return;
   const delta=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*(e.deltaMode===1?16:e.deltaMode===2?node.clientWidth:1);
   if(!delta)return;
   e.preventDefault();node.scrollLeft+=delta;
  };
  node.addEventListener('pointerdown',down);
  window.addEventListener('pointermove',move,{passive:false});
  window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
  node.addEventListener('lostpointercapture',finish);node.addEventListener('click',click,true);
  node.addEventListener('dragstart',drag);node.addEventListener('wheel',wheel,{passive:false});
  return()=>{
   if(gesture&&node.hasPointerCapture(gesture.id))node.releasePointerCapture(gesture.id);
   node.classList.remove('is-dragging');node.removeEventListener('pointerdown',down);
   window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);
   node.removeEventListener('lostpointercapture',finish);node.removeEventListener('click',click,true);
   node.removeEventListener('dragstart',drag);node.removeEventListener('wheel',wheel);
  };
 },[]);
 return ref;
}
