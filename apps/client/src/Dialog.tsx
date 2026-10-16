import {useEffect,useId,useRef} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
const dialogs:HTMLElement[]=[];
let layer=40;

export default function Dialog({title,onClose,children,className=''}:{title:string;onClose:()=>void;children:ReactNode;className?:string}) {
 const panel=useRef<HTMLElement>(null),close=useRef(onClose),titleId=useId();close.current=onClose;
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,node=panel.current!;
  for(const dialog of dialogs){dialog.inert=true;dialog.setAttribute('aria-hidden','true');}
  dialogs.push(node);node.parentElement!.style.zIndex=String(++layer);
  const focusable=()=>[...node.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(x=>x.getClientRects().length);
  (focusable()[0]??node).focus();
  const key=(event:KeyboardEvent)=>{
   if(dialogs.at(-1)!==node)return;
   if(event.key==='Escape'){event.preventDefault();close.current();}
   if(event.key==='Tab'){
    const items=focusable(),first=items[0],last=items.at(-1);
    if(!first){event.preventDefault();node.focus();}
    else if(event.shiftKey&&(document.activeElement===first||document.activeElement===node)){event.preventDefault();last!.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===node)){event.preventDefault();first.focus();}
   }
  };
  node.addEventListener('keydown',key);
  return()=>{node.removeEventListener('keydown',key);const index=dialogs.indexOf(node);if(index>=0)dialogs.splice(index,1);const top=dialogs.at(-1);if(top){top.inert=false;top.removeAttribute('aria-hidden');if(previous?.isConnected&&top.contains(previous))previous.focus();else top.querySelector<HTMLElement>('button,input,a[href]')?.focus();}else if(previous?.isConnected)previous.focus();};
 },[]);
 return createPortal(<div className="online-dialog-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`online-dialog ${className}`}><header><h2 id={titleId}>{title}</h2><button onClick={onClose} aria-label={`关闭${title}`}>关闭 ×</button></header><div className="online-dialog-body">{children}</div></section></div>,document.body);
}
