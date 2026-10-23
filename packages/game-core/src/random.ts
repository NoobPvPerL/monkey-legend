import type {RandomState} from './types';
export function uint(r:RandomState):number {r.seed=(r.seed+0x6D2B79F5)>>>0;let t=r.seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return (t^(t>>>14))>>>0;}
export function integer(r:RandomState,n:number):number {
 if(!Number.isInteger(n)||n<1||n>0x100000000)throw Error('随机范围无效');
 const trace=r._gTrace,old=trace?.entries[trace.index];
 if(old){if(old.bound!==n||!Number.isInteger(old.value)||old.value<0||old.value>=n)throw Error('G随机续接范围不一致');trace!.index++;r.seed=old.seed;return old.value;}
 const limit=Math.floor(4294967296/n)*n;let x=uint(r);while(x>=limit)x=uint(r);const value=x%n;
 if(trace){trace.entries.push({bound:n,value,seed:r.seed});trace.index++;}return value;
}
export function shuffled<T>(r:RandomState,items:readonly T[]):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const j=integer(r,i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
