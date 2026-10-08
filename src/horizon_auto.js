import {generateHorizonPlan,HORIZONS} from './horizon_strategies.js';

// Deduplicate the five shared candle frames and contract request within one coin only.
// Responses are cloned so each period independently performs the unchanged plan gates.
export async function analyzeCoinPeriods(symbol,{signal,fetcher=fetch,clock=Date.now}={}){
 const cache=new Map();
 const sharedFetch=(url,options={})=>{
  if(!cache.has(url))cache.set(url,fetcher(url,{...options,signal:signal?AbortSignal.any([signal,options.signal].filter(Boolean)):options.signal}));
  return cache.get(url).then(response=>response.clone());
 };
 return Promise.all(Object.keys(HORIZONS).map(horizon=>generateHorizonPlan(symbol,horizon,{fetcher:sharedFetch,clock})));
}

// No timers or ledger writes inside the controller. The page owns foreground lifecycle.
export function createHorizonAuto({available,refresh,select,analyze=analyzeCoinPeriods,write,onChange=()=>{},clock=Date.now,delay=30000}){
 let enabled=true,running=false,epoch=0,controller,nextAt=0,lastAt=null,completed=0,total=0,error=null,paused=true;
 const view=()=>({enabled,running,paused,nextAt,lastAt,completed,total,error});
 const notify=()=>onChange(view());
 function pause(){epoch++;controller?.abort();paused=true;nextAt=0;notify();}
 async function tick(force=false){
  if(!enabled||!available()){if(!paused)pause();return;}
  if(running||(!force&&!paused&&clock()<nextAt))return;
  running=true;paused=false;completed=0;total=0;error=null;controller=new AbortController();
  const token=epoch,signal=controller.signal,current=()=>token===epoch&&enabled&&available()&&!signal.aborted;
  notify();
  try{
   await refresh(current);if(!current())return;
   const selection=select();if(selection.reason)throw new Error(selection.reason);
   const symbols=selection.rows.slice(0,5).map(row=>row.symbol);total=symbols.length;notify();
   let index=0;
   const worker=async()=>{while(current()&&index<symbols.length){const symbol=symbols[index++];
    let records;try{records=await analyze(symbol,{signal});}catch(e){records=Object.keys(HORIZONS).map(horizon=>({symbol,horizon,status:'BLOCKED',reason:String(e.message||e),strategies:[]}));}
    if(!current())return;
    write(symbol,records);completed++;notify();
   }};
   await Promise.all([worker(),worker()]);if(current())lastAt=clock();
  }catch(e){if(current())error=String(e.message||e);}
  finally{running=false;if(current())nextAt=clock()+delay;notify();}
 }
 function setEnabled(value){enabled=!!value;pause();if(enabled)void tick();}
 return {view,tick,pause,setEnabled};
}
