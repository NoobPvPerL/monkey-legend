import {cloudRpc} from './cloud';
import {createGateway} from './gateway';
const config=await cloudRpc(process.env.WORKBUDDY_PUBLIC_CONFIG??'config/workbuddy-public.json');
const port=Number(process.env.PORT??3000);if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT 无效');
const host=process.env.ML_LOOPBACK==='1'?'127.0.0.1':'0.0.0.0';
const gateway=createGateway({...config,allowLoopback:process.env.ML_LOOPBACK==='1'});
gateway.http.listen(port,host,()=>console.log(`monkey-legend P2 listening on ${host}:${port}`));
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{if(stopping)return;stopping=true;void gateway.close().then(()=>process.exit(0));setTimeout(()=>process.exit(1),25000).unref();});
