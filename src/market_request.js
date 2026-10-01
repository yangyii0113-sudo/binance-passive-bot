import { MARKET_TIMEOUT_MS } from './config.js';

const resources={
  contracts:{path:'/fapi/v1/exchangeInfo',label:'合約清單'},
  tickers:{path:'/fapi/v1/ticker/24hr',label:'24 小時行情'}
};
function failure(resource,kind,status=null){
  const messages={
    restricted:'資料來源限制此連線環境（HTTP 451）；請核對來源服務的使用資格，平台暫停判定。',
    rate:'資料來源暫時限流，等待下一次更新。',
    timeout:'連線逾時，尚未取得完整資料。',
    network:'連線失敗；瀏覽器未提供回應狀態，無法判定是網路、跨來源或來源限制。',
    payload:'來源回應格式異常，停止使用這次資料。',
    http:`資料來源回應 HTTP ${status}，停止使用這次資料。`
  };
  const error=new Error(`${resource.label}：${messages[kind]}`);
  error.marketDiagnostic={endpoint:resource.path,kind,httpStatus:status,checkedAt:Date.now()};
  return error;
}
// Fixed public endpoints only; no proxy, credentials, order routes or automatic fallback.
export async function fetchMarketJson(key,{fetcher=fetch,timeoutMs=MARKET_TIMEOUT_MS}={}){
  const resource=resources[key];if(!resource)throw new Error('未知行情來源');
  let response;
  try{response=await fetcher(`https://fapi.binance.com${resource.path}`,{method:'GET',cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});}
  catch(error){throw failure(resource,['TimeoutError','AbortError'].includes(error?.name)?'timeout':'network');}
  if(!response.ok)throw failure(resource,response.status===451?'restricted':[418,429].includes(response.status)?'rate':'http',response.status);
  let data;
  try{data=await response.json();}catch{throw failure(resource,'payload',response.status);}
  if(key==='contracts'?(!Array.isArray(data?.symbols)||!data.symbols.length):!Array.isArray(data))throw failure(resource,'payload',response.status);
  return data;
}
