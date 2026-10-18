import {useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';

/** Expands in place so skill/card form state survives opening and closing. */
export default function ActionPanel({selected,children}:{selected:boolean;children:ReactNode}){
 const [expanded,setExpanded]=useState(false),panel=useRef<HTMLElement>(null);
 useEffect(()=>{
  const media=matchMedia('(min-width:1000px)'),resize=()=>{if(media.matches)setExpanded(false);};
  media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);
 },[]);
 useEffect(()=>{
  if(!expanded)return;
  const previous=document.activeElement as HTMLElement|null,node=panel.current!;
  const items=()=>[...node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(x=>x.getClientRects().length);
  items()[0]?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();setExpanded(false);}
   if(e.key==='Tab'){
    const all=items(),first=all[0],last=all.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  node.addEventListener('keydown',key);
  return()=>{node.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[expanded]);
 return <>
  {expanded&&createPortal(<div className="mobile-actions-backdrop" onClick={()=>setExpanded(false)}/>,document.body)}
  <section ref={panel} className={`compact-actions ${selected?'has-selection':''} ${expanded?'expanded-mobile-actions':''}`} aria-label={expanded?'完整操作':'操作区'} role={expanded?'dialog':undefined} aria-modal={expanded||undefined}>
   <button className="mobile-actions-toggle" onClick={()=>setExpanded(!expanded)}>{expanded?'收起操作':'操作与设置'}</button>
   {children}
  </section>
 </>;
}
