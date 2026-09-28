const CONTRACT_URL='https://fapi.binance.com/fapi/v1/exchangeInfo';
const CONTRACT_WINDOW_MS=15000;

// One short-lived batch may share its contract list. Candle requests always go
// to the source; no stale fallback, persistent cache or change to snapshot TTL.
export function createAnalysisBatchFetcher({fetcher=fetch,clock=Date.now}={}) {
  let shared=null;
  return async (url,options) => {
    if(url!==CONTRACT_URL)return fetcher(url,options);
    const now=clock();
    if(!shared||now<shared.startedAt||now-shared.startedAt>=CONTRACT_WINDOW_MS) {
      const entry={startedAt:now,promise:null};
      shared=entry;
      entry.promise=(async()=>{
        const response=await fetcher(url,options);
        const data=await response.json();
        if(!response.ok||!Array.isArray(data?.symbols)||!data.symbols.length)throw new Error('合約清單無法核對');
        return {ok:response.ok,status:response.status,data};
      })().catch(error=>{if(shared===entry)shared=null;throw error;});
    }
    const entry=shared,result=await entry.promise,age=clock()-entry.startedAt;
    if(age<0||age>=CONTRACT_WINDOW_MS) {
      if(shared===entry)shared=null;
      throw new Error('本輪合約核對逾時，請重新分析');
    }
    return {ok:result.ok,status:result.status,json:async()=>structuredClone(result.data)};
  };
}
