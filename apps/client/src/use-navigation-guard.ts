import {useEffect,useState} from 'react';
const marker='monkeyLegendNavigationGuard';
/** One reversible history entry per active room; no server leave on browser Back. */
export function useNavigationGuard(active:boolean){
 const [confirming,setConfirming]=useState(false);
 useEffect(()=>{
  if(!active)return;
  let leaving=false;
  const state=()=>({...history.state,[marker]:true});
  if(!history.state?.[marker])history.pushState(state(),'');
  const back=()=>{if(leaving)return;history.pushState(state(),'');setConfirming(true);};
  const unload=(e:BeforeUnloadEvent)=>{if(leaving)return;e.preventDefault();e.returnValue='';};
  const exit=()=>{leaving=true;};
  window.addEventListener('popstate',back);window.addEventListener('beforeunload',unload);window.addEventListener('ml-confirm-navigation',exit);
  return()=>{window.removeEventListener('popstate',back);window.removeEventListener('beforeunload',unload);window.removeEventListener('ml-confirm-navigation',exit);setConfirming(false);};
 },[active]);
 return {confirming,cancel:()=>setConfirming(false),leave:()=>{window.dispatchEvent(new Event('ml-confirm-navigation'));history.go(-2);}};
}
