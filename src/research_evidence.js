import { agentPlanStatus } from './agent_trade_plan.js';
import { HORIZONS, FRAME_MS, frameOpen, horizonPlanStatus } from './horizon_strategies.js';

const KEY='foxyya.research-evidence.history.v1',LIMIT=120,PER_SCOPE=8;
const directions=['LONG','SHORT','MIXED','UNKNOWN'];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const symbol=v=>typeof v==='string'&&/^[\p{L}\p{N}]+USDT$/u.test(v);
const text=v=>typeof v==='string'?v.slice(0,500):'';
const direction=v=>directions.includes(v)?v:'UNKNOWN';
const frames=scope=>scope==='short'?['1h','4h']:[HORIZONS[scope]?.context,HORIZONS[scope]?.regime];
const keys=scope=>scope==='short'?['structured','breakout','meanReversion']:['breakout','structured'];
const sameScope=(a,b)=>a.symbol===b.symbol&&a.scope===b.scope;

// Conclusions only. These records cannot be restored as plans or fills.
function compact(s){
 const expected=frames(s?.scope),strategyKeys=keys(s?.scope);
 if(!s||s.version!=='research-evidence-v1'||!symbol(s.symbol)||!['short',...Object.keys(HORIZONS)].includes(s.scope)||
  ![s.checkedAt,s.closedAt].every(finite)||s.closedAt<0||s.closedAt>=s.checkedAt||
  s.closedAt!==frameOpen(s.checkedAt,HORIZONS[s.scope]?.trigger||'1h')-1||
  !['plan','wait','conflict'].includes(s.verdict)||!Array.isArray(s.directions)||s.directions.length!==2||
  !s.directions.every((d,i)=>d?.frame===expected[i]&&directions.includes(d.direction))||
  !Array.isArray(s.strategies)||s.strategies.length!==strategyKeys.length||
  !s.strategies.every((p,i)=>p?.key===strategyKeys[i]&&['SETUP','WAIT','SKIP','BLOCKED'].includes(p.status)&&
   (p.side===null||['LONG','SHORT'].includes(p.side))))throw new Error('研究證據紀錄格式無效');
 return {version:s.version,symbol:s.symbol,scope:s.scope,historical:true,checkedAt:s.checkedAt,closedAt:s.closedAt,verdict:s.verdict,reason:text(s.reason),
  directions:s.directions.map(d=>({frame:d.frame,direction:d.direction})),
  strategies:s.strategies.map(p=>({key:p.key,status:p.status,side:p.side,reason:text(p.reason)}))};
}
function gate(record,now){
 try{return record&&Object.hasOwn(record,'horizon')?horizonPlanStatus(record,now):agentPlanStatus(record,now);}
 catch{return {key:'blocked',reason:'資料格式異常，請重新核對',plans:[]};}
}
export function evidenceSnapshot(record,now=Date.now()){
 if(!finite(now)||!symbol(record?.symbol)||record?.row&&record.row.symbol!==record.symbol)return null;
 const scope=Object.hasOwn(record,'horizon')?record.horizon:'short',c=HORIZONS[scope];
 if(scope!=='short'&&!c)return null;
 const result=gate(record,now);
 if(!['plan','wait','conflict'].includes(result.key))return null;
 const a=scope==='short'?record.row?.analysis:record.evidence;
 const closedAt=a?.closedAt,trigger=c?.trigger||'1h';
 if(!finite(closedAt)||closedAt!==frameOpen(record.checkedAt,trigger)-1)return null;
 const values=scope==='short'?[a.hourlyDirection,a.fourHourlyDirection]:[a.context,a.regime];
 const plans=scope==='short'?a.strategies:record.strategies;
 try{return compact({version:'research-evidence-v1',symbol:record.symbol,scope,checkedAt:record.checkedAt,closedAt,verdict:result.key,reason:result.reason,
  directions:frames(scope).map((frame,i)=>({frame,direction:direction(values[i])})),
  strategies:keys(scope).map(key=>{const p=plans.find(p=>p.key===key);return {key,status:p.status,side:['LONG','SHORT'].includes(p.side)?p.side:null,reason:p.reason};})});}
 catch{return null;}
}

export function loadEvidenceHistory(storage){
 try{
  const raw=(storage??localStorage).getItem(KEY);if(!raw)return {runs:[],error:null};
  if(raw.length>1500000)throw new Error('紀錄過大');
  const data=JSON.parse(raw);
  if(data.version!==1||!Array.isArray(data.runs)||data.runs.length>LIMIT)throw new Error('紀錄格式異常');
  return {runs:data.runs.map(compact),error:null};
 }catch{return {runs:[],error:'研究證據紀錄無法讀取；原資料未覆寫。'};}
}
const fingerprint=s=>JSON.stringify([s.verdict,s.reason,s.directions,s.strategies]);
export function saveEvidenceSnapshot(record,{storage,now=Date.now()}={}){
 const history=loadEvidenceHistory(storage);
 if(history.error)throw new Error(history.error);
 if(history.runs.some(r=>r.checkedAt>now))throw new Error('研究證據紀錄時間位於未來；原資料未覆寫，請核對裝置時間。');
 const next=evidenceSnapshot(record,now);if(!next)return history;
 const previous=history.runs.filter(r=>sameScope(r,next)).sort((a,b)=>b.checkedAt-a.checkedAt)[0];
 if(previous&&previous.checkedAt>next.checkedAt)return history;
 const repeated=previous&&fingerprint(previous)===fingerprint(next);
 const rows=[next,...history.runs.filter(r=>!(sameScope(r,next)&&(r.checkedAt===next.checkedAt||repeated&&r===previous)))].sort((a,b)=>b.checkedAt-a.checkedAt);
 const counts=new Map();
 const runs=rows.filter(r=>{const key=`${r.symbol}:${r.scope}`,count=(counts.get(key)||0)+1;counts.set(key,count);return count<=PER_SCOPE;}).slice(0,LIMIT);
 try{(storage??localStorage).setItem(KEY,JSON.stringify({version:1,runs}));}
 catch{throw new Error('研究證據未保存：瀏覽器儲存空間不足或禁止儲存。');}
 return {runs,error:null};
}

export function evidenceModel(record,{history={runs:[]},now=Date.now()}={}){
 const snapshot=evidenceSnapshot(record,now),result=gate(record,now);
 if(!snapshot)return {available:false,reason:['expired','loading','empty'].includes(result.key)?result.reason:'資料或身分尚未通過證據核對，請重新核對。',snapshot:null,sources:[],previous:null,changes:[],social:null};
 const c=HORIZONS[snapshot.scope],sourceFrames=c?[c.trigger,c.context,c.regime]:['1h','4h'];
 const sources=sourceFrames.map(frame=>{
  const closedAt=frameOpen(snapshot.checkedAt,frame)-1;
  const params=new URLSearchParams({symbol:snapshot.symbol,interval:frame,endTime:String(closedAt),limit:c?'600':'601'});
  return {frame,closedAt,url:`https://fapi.binance.com/fapi/v1/klines?${params}`};
 });
 const candidates=[];
 if(!history.error)for(const r of history.runs||[])try{const s=compact(r);if(sameScope(s,snapshot)&&s.checkedAt<snapshot.checkedAt&&s.closedAt<=snapshot.closedAt)candidates.push(s);}catch{/* Invalid evidence never participates in comparisons. */}
 const previous=candidates.sort((a,b)=>b.checkedAt-a.checkedAt)[0]||null,changes=[];
 if(previous){
  snapshot.directions.forEach((d,i)=>{const before=previous.directions[i].direction;if(before!==d.direction)changes.push({kind:['LONG','SHORT'].includes(before)&&['LONG','SHORT'].includes(d.direction)?'reversal':'direction',label:d.frame,before,after:d.direction});});
  snapshot.strategies.forEach((p,i)=>{const before=previous.strategies[i];if(p.status!==before.status||p.side!==before.side||p.reason!==before.reason)changes.push({kind:'strategy',label:p.key,before:before.status,after:p.status,beforeSide:before.side,afterSide:p.side,beforeReason:before.reason,afterReason:p.reason});});
  if(previous.verdict!==snapshot.verdict)changes.push({kind:'verdict',label:'整體判定',before:previous.verdict,after:snapshot.verdict});
 }
 const sides=snapshot.directions.map(d=>d.direction).concat(snapshot.strategies.filter(p=>p.status==='SETUP').map(p=>p.side));
 return {available:true,snapshot,sourceCount:1,sources,previous,changes,conflict:sides.includes('LONG')&&sides.includes('SHORT'),social:null};
}
