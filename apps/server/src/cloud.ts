import {readFile} from 'node:fs/promises';
import {createWorkBuddyCloud,createMemoryStorage} from '@tencent-ai/workbuddy-cloud-sdk';
import type {Rpc} from '../../../packages/online/src/protocol';

export async function cloudRpc(path:string):Promise<{rpc:Rpc;origin:string}> {
 const raw=JSON.parse(await readFile(path,'utf8')),config=raw.publicConfig??raw;
 const endpoint=new URL(config.endpoint);
 if(endpoint.protocol!=='https:'||typeof config.publishableKey!=='string'||!config.publishableKey)throw Error('WorkBuddy publicConfig 无效');
 type CloudDatabase={public:{Tables:Record<string,never>;Views:Record<string,never>;Functions:Record<string,{Args:Record<string,unknown>;Returns:unknown}>}};
 const cloud=createWorkBuddyCloud<CloudDatabase>({endpoint:endpoint.origin,publishableKey:config.publishableKey,storage:createMemoryStorage(),fetch:(input,init={})=>{
  const headers=new Headers(init.headers);headers.set('Origin',endpoint.origin);
  return fetch(input,{...init,headers,signal:AbortSignal.timeout(20000)});
 }});
 const rpc:Rpc=async(name,args)=>{const {data,error}=await cloud.database.rpc(name,args);if(error)throw Error('云数据库暂不可用，请保留原请求重试');return data;};
 return {rpc,origin:endpoint.origin};
}
