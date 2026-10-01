import { pathToFileURL } from 'node:url';
import { fetchMarketJson } from '../src/market_request.js';
import { normalizeForwardTick, tickContinuity } from '../src/advice_forward.js';

export function checkPublicStream({WebSocketClass=WebSocket,clock=Date.now,timeoutMs=12000}={}){
  return new Promise(resolve=>{
    let socket,timer,previous,done=false;
    const finish=result=>{
      if(done)return;done=true;clearTimeout(timer);
      if(socket){socket.onmessage=socket.onerror=socket.onclose=null;try{socket.close();}catch{}}
      resolve(result);
    };
    timer=setTimeout(()=>finish({ok:false,reason:'十二秒內未取得兩筆連續合格行情'}),timeoutMs);
    try{socket=new WebSocketClass('wss://fstream.binance.com/market/ws/btcusdt@aggTrade');}
    catch{return finish({ok:false,reason:'無法建立即時連線'});}
    socket.onmessage=event=>{
      try{
        const tick=normalizeForwardTick(JSON.parse(event.data),'BTCUSDT',clock());
        const continuity=tickContinuity(previous,tick);
        if(continuity==='gap')return finish({ok:false,reason:'成交序號或時間不連續'});
        if(continuity==='next')return finish({ok:true,received:2,checkedAt:clock()});
        previous=tick;
      }catch{return finish({ok:false,reason:'行情格式或時間未通過核對'});}
    };
    socket.onerror=socket.onclose=()=>finish({ok:false,reason:'即時連線未完成便中斷'});
  });
}

export async function researchPreflight({request=fetchMarketJson,stream=checkPublicStream}={}){
  const result={checkedAt:new Date().toISOString(),readOnly:true,paperOnly:true,realOrderLocked:true,noBackfill:true,checks:[],ready:false};
  for(const key of ['contracts','tickers']){
    try{await request(key);result.checks.push({source:key,ok:true});}
    catch(error){result.checks.push({source:key,ok:false,reason:error.message,diagnostic:error.marketDiagnostic||null});return result;}
  }
  const live=await stream();result.checks.push({source:'websocket',...live});
  result.ready=live.ok===true;
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await researchPreflight();
  console.log(JSON.stringify(result,null,2));
  process.exitCode=result.ready?0:1;
}
