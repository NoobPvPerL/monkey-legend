import {useState} from 'react';
import type {ReactNode} from 'react';
import Dialog from './Dialog';

/** Keep one interactive board; the full-map dialog reuses the same content. */
export default function BattleMap({label,children}:{label:string;children:ReactNode}){
 const [expanded,setExpanded]=useState(false);
 return <section className="compact-map" aria-label={label}>
  <div className="map-toolbar"><strong>{label} · 32格</strong><button onClick={()=>setExpanded(true)}>查看全图</button></div>
  {!expanded&&children}
  {expanded&&<Dialog title="完整地图" className="map-dialog" onClose={()=>setExpanded(false)}><div className="online-board stage3-board map-dialog-board">{children}</div></Dialog>}
 </section>;
}
