import { runHorizonComparison } from './horizon_replay.js';
self.onmessage=async({data})=>{
 try{self.postMessage({ok:true,result:await runHorizonComparison(data.symbol,data.horizon)});}
 catch(e){self.postMessage({ok:false,reason:String(e.message)});}
};
