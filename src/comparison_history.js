const KEY='foxyya.exit-comparison.history.v1';
const MAX_RUNS=20;
const validSymbol=s=>typeof s==='string'&&/^[\p{L}\p{N}]+USDT$/u.test(s);
const date=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
function compactResult(result,symbol){
  if(!result||result.symbol!==symbol||result.version!=='TP01-S1'||![result.start,result.end,result.split].every(Number.isFinite)||!(result.start<result.split&&result.split<result.end))throw new Error('比較結果格式不完整');
  const output={symbol,version:result.version,start:result.start,end:result.end,split:result.split,fundingIncluded:false};
  for(const section of ['development','holdout']){
    output[section]={};
    for(const rule of section==='development'?['baseline','enhanced']:['baseline','enhanced','stress']){
      const metrics=result[section]?.[rule];
      if(!metrics||!Number.isInteger(metrics.trades)||metrics.trades<0||!Number.isFinite(metrics.netPnl))throw new Error('比較指標格式不完整');
      output[section][rule]={};
      for(const field of ['trades','signals','skipped','netPnl','netReturnPct','winRate','profitFactor','avgPnl','closedDrawdownPct']){
        const v=metrics[field];if(v!==undefined&&v!==null&&!Number.isFinite(v))throw new Error('比較指標格式無效');
        output[section][rule][field]=v??null;
      }
      if(metrics.diagnostics){
        const fields=['evaluated','dataBlocked','trendWait','pullbackWait','extendedWait','riskBlocked','noEntry','entryGap','stopGap','noBreakout','missingFuture'];
        if(fields.some(k=>!Number.isInteger(metrics.diagnostics[k])||metrics.diagnostics[k]<0))throw new Error('診斷計數格式無效');
        output[section][rule].diagnostics=Object.fromEntries(fields.map(k=>[k,metrics.diagnostics[k]]));
      }
      output[section][rule].skipReasons=Object.fromEntries(Object.entries(metrics.skipReasons||{}).filter(([k,v])=>k.length<=300&&Number.isInteger(v)&&v>=0));
    }
  }
  return output;
}
function compactRun(run){
  if(!run||typeof run.id!=='string'||run.id.length>100||!date(run.startedAt)||!date(run.updatedAt)||!['RUNNING','DONE','STOPPED','INTERRUPTED'].includes(run.status)||!Array.isArray(run.rows)||!run.rows.length||run.rows.length>10)throw new Error('歷史比較紀錄格式無效');
  if(new Set(run.rows.map(r=>r.symbol)).size!==run.rows.length)throw new Error('歷史比較幣種重複');
  return {id:run.id,startedAt:run.startedAt,updatedAt:run.updatedAt,scannedAt:date(run.scannedAt)?run.scannedAt:null,status:run.status,rows:run.rows.map(row=>{
    if(!validSymbol(row.symbol)||!['PENDING','RUNNING','DONE','ERROR','CANCELLED'].includes(row.status))throw new Error('歷史比較狀態無效');
    return {symbol:row.symbol,status:row.status,...(row.status==='DONE'?{result:compactResult(row.result,row.symbol)}:{}),...(row.error?{error:String(row.error).slice(0,500)}:{})};
  })};
}
export function loadComparisonHistory(storage){
  try {
    const raw=(storage??localStorage).getItem(KEY);if(!raw)return {runs:[],error:null};
    const parsed=JSON.parse(raw);
    if(parsed.version!==1||!Array.isArray(parsed.runs)||parsed.runs.length>MAX_RUNS)throw new Error('格式無效');
    return {runs:parsed.runs.map(compactRun),error:null};
  } catch {return {runs:[],error:'無法讀取比較歷史；原有儲存資料未被覆寫。'};}
}
export function saveComparisonRun(run,storage){
  const previous=loadComparisonHistory(storage);
  if(previous.error)throw new Error(previous.error);
  const record=compactRun(run);
  const runs=[record,...previous.runs.filter(r=>r.id!==record.id)].slice(0,MAX_RUNS);
  try {(storage??localStorage).setItem(KEY,JSON.stringify({version:1,runs}));}
  catch {throw new Error('比較結果尚未保存：瀏覽器儲存空間不足或禁止儲存。');}
  return runs;
}
export function restoreComparisonRun(run){
  const record=compactRun(run);
  const interrupted=record.status==='RUNNING';
  return {...record,status:interrupted?'INTERRUPTED':record.status,rows:record.rows.map(row=>['PENDING','RUNNING'].includes(row.status)?{symbol:row.symbol,status:'CANCELLED',error:'上次比較中斷，未自動續跑'}:row)};
}
