const KEY='foxyya.coin-analysis.history.v1',LIMIT=20;
const symbol=s=>typeof s==='string'&&/^[\p{L}\p{N}]+USDT$/u.test(s);
const number=(v,nullable=false)=>typeof v==='number'&&Number.isFinite(v)||nullable&&v===null;
const text=v=>typeof v==='string'?v.slice(0,500):'';
function compact(run){
 if(!run||typeof run.id!=='string'||!run.id.length||run.id.length>100||typeof run.scannedAt!=='string'||!Number.isFinite(Date.parse(run.scannedAt))||!Array.isArray(run.rows)||!run.rows.length||run.rows.length>10||new Set(run.rows.map(r=>r.symbol)).size!==run.rows.length)throw new Error('分析紀錄格式無效');
 return {id:run.id,scannedAt:run.scannedAt,rows:run.rows.map(row=>{
  if(!symbol(row.symbol)||![row.rank,row.change,row.volume,row.strength].every(v=>number(v))||!Number.isInteger(row.rank)||row.rank<1||row.rank>10||row.volume<0||row.strength<0||row.strength>100)throw new Error('幣種紀錄格式無效');
  const a=row.analysis;
  if(!a||!['VALID','BLOCKED'].includes(a.status))throw new Error('分析狀態無效');
  const base={symbol:row.symbol,rank:row.rank,change:row.change,volume:row.volume,strength:row.strength};
  if(a.status==='BLOCKED')return {...base,analysis:{version:'coin-analysis-v1',status:'BLOCKED',reason:text(a.reason),strategies:[]}};
  if(a.version!=='coin-analysis-v1'||![a.analyzedAt,a.closedAt,a.validUntil,a.lastClose,a.atrPct].every(v=>number(v))||!(a.closedAt<a.analyzedAt&&a.analyzedAt<a.validUntil)||a.lastClose<=0||a.atrPct<0||!number(a.volumeRatio,true)||a.volumeRatio!==null&&a.volumeRatio<0||!number(a.emaDistanceAtr,true)||typeof a.aligned!=='boolean'||![a.hourlyDirection,a.fourHourlyDirection].every(v=>['LONG','SHORT','MIXED'].includes(v))||!Array.isArray(a.strategies)||a.strategies.map(p=>p.key).join(',')!=='structured,breakout,meanReversion')throw new Error('分析數據無效');
  const analysis=Object.fromEntries(['version','status','analyzedAt','closedAt','validUntil','lastClose','hourlyDirection','fourHourlyDirection','aligned','atrPct','volumeRatio','emaDistanceAtr'].map(k=>[k,a[k]]));
  analysis.strategies=a.strategies.map(p=>{
   if(!['SETUP','WAIT','SKIP','BLOCKED'].includes(p.status)||p.status==='SETUP'&&!['LONG','SHORT'].includes(p.side))throw new Error('策略紀錄無效');
   return {key:p.key,status:p.status,...(['LONG','SHORT'].includes(p.side)?{side:p.side}:{}),reason:text(p.reason)};
  });
  return {...base,analysis};
 })};
}
export function loadCoinHistory(storage){
 try{
  const raw=(storage??localStorage).getItem(KEY);if(!raw)return {runs:[],error:null};
  if(raw.length>2000000)throw new Error('紀錄過大');
  const data=JSON.parse(raw);
  if(data.version!==1||!Array.isArray(data.runs)||data.runs.length>LIMIT)throw new Error('格式無效');
  return {runs:data.runs.map(compact),error:null};
 }catch{return {runs:[],error:'無法讀取幣種分析紀錄；原資料未被覆寫。'};}
}
export function saveCoinAnalysis(run,storage){
 const previous=loadCoinHistory(storage);if(previous.error)throw new Error(previous.error);
 const record=compact(run),runs=[record,...previous.runs.filter(r=>r.id!==record.id)].slice(0,LIMIT);
 try{(storage??localStorage).setItem(KEY,JSON.stringify({version:1,runs}));}
 catch{throw new Error('分析完成，但紀錄未保存：瀏覽器儲存空間不足或禁止儲存。');}
 return runs;
}
export function restoreCoinAnalysis(run){
 const record=compact(run);
 return {rows:record.rows,total:record.rows.length,scannedAt:record.scannedAt,analysisHistorical:true,analysisHistoryId:record.id,analysisFilter:'all',analysisSaved:false,loading:false,error:null,comparison:null,comparisonError:null,batchRows:[],batchRecord:null,batchHistoryId:null};
}
