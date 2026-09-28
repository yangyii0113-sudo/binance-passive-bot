const H=3600000, D=24*H;
const DURATIONS={'15m':H/4,'1h':H,'4h':4*H,'12h':12*H,'1d':D,'1w':7*D};
export const OUTLOOK_TTL=5*60000;
export const HORIZONS=Object.freeze([
  {key:'intraday',name:'短線',frames:['15m','1h','4h'],anchor:'1h',window:'日內～數日',frameText:'15 分／1 小時／4 小時'},
  {key:'swing',name:'中期',frames:['4h','12h','1d'],anchor:'4h',window:'數日～數週',frameText:'4 小時／12 小時／日線'},
  {key:'position',name:'長期',frames:['1d','1w'],anchor:'1d',window:'數週～數月',frameText:'日線／週線'}
]);
export function candleOpenAt(time,interval){
  if(interval==='1M'){const d=new Date(time);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);}
  const step=DURATIONS[interval];if(!step)return NaN;
  const offset=interval==='1w'?4*D:0;
  return Math.floor((time-offset)/step)*step+offset;
}
export function nextCandleOpen(open,interval){
  if(interval==='1M'){const d=new Date(open);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);}
  return open+DURATIONS[interval];
}
// Validates all supplied closed bars; no interpolation, sorting or gap filling.
export function frameOutlookEvidence(candles,interval,now=Date.now()){
  const blocked=reason=>({status:'BLOCKED',reason});
  if(!Array.isArray(candles)||candles.length<55)return blocked('完整收盤樣本未達 55 根');
  if(candles.some((c,i)=>![c.openTime,c.closeTime,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||
    Math.min(c.open,c.high,c.low,c.close)<=0||c.volume<0||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||
    c.openTime!==candleOpenAt(c.openTime,interval)||c.closeTime!==nextCandleOpen(c.openTime,interval)-1||c.closeTime>=now||
    (i>0 && c.openTime!==candles[i-1].closeTime+1)))return blocked('K 線時間、價格或連續性異常');
  const last=candles.at(-1);
  if(last.closeTime!==candleOpenAt(now,interval)-1)return blocked('缺少最新完整收盤 K 線');
  const prior=candles.slice(-21,-1),avgVolume=prior.reduce((s,c)=>s+c.volume,0)/20;
  const ranges=candles.slice(-14).map((c,i)=>{const prev=candles[candles.length-15+i].close;return Math.max(c.high-c.low,Math.abs(c.high-prev),Math.abs(c.low-prev));});
  return {status:'VALID',closedAt:last.closeTime,validUntil:nextCandleOpen(last.closeTime+1,interval),
    rangeHigh:Math.max(...prior.map(c=>c.high)),rangeLow:Math.min(...prior.map(c=>c.low)),
    relativeVolume:avgVolume>0?last.volume/avgVolume:null,atr:ranges.reduce((a,b)=>a+b,0)/14};
}
const direction=f=>f.last>f.ema20 && f.ema20>f.ema50?'bull':f.last<f.ema20 && f.ema20<f.ema50?'bear':'mixed';
export function buildTrendOutlook(technical,record,now=Date.now()){
  const updated=Date.parse(technical?.updatedAt),frames=Array.isArray(technical?.frames)?technical.frames:[];
  let globalReason='';
  if(!technical || technical.status!=='LIVE')globalReason='尚未取得完整技術分析，請執行分析';
  else if(technical.historical || !Number.isFinite(updated) || updated>now || now-updated>=OUTLOOK_TTL)globalReason='分析已過期或時間無法核對，請重新分析';
  else if(!record || record.symbol!==technical.symbol || record.status!=='LIVE' || record.historical || !Number.isFinite(record.checkedAt) || record.checkedAt>now || now-record.checkedAt>=OUTLOOK_TTL)globalReason='合約資格尚未完成本次核對，暫不提供情勢建議';
  const horizons=HORIZONS.map(spec=>{
    const selected=spec.frames.map(interval=>frames.find(f=>f.interval===interval));
    let reason=globalReason;
    if(!reason){
      const invalid=selected.find((f,i)=>!f || frames.filter(x=>x.interval===spec.frames[i]).length!==1 || f.status!=='LIVE' || f.outlook?.status!=='VALID' ||
        !String(f.source).startsWith('Binance USD-M public klines') || [f.last,f.ema20,f.ema50].some(n=>!Number.isFinite(n)||n<=0) ||
        !Number.isFinite(f.closedAt) || f.closedAt!==f.outlook.closedAt || f.closedAt>=updated || f.closedAt!==candleOpenAt(now,f.interval)-1 ||
        !Number.isFinite(f.outlook.validUntil) || f.outlook.validUntil!==nextCandleOpen(f.closedAt+1,f.interval) || f.outlook.validUntil<=now ||
        !Number.isFinite(f.outlook.rangeHigh)||!Number.isFinite(f.outlook.rangeLow)||f.outlook.rangeLow<=0||f.outlook.rangeHigh<f.outlook.rangeLow);
      // find() returns undefined for an absent frame, so verify presence separately.
      if(selected.some(f=>!f)||invalid)reason=invalid?.outlook?.reason || '所需週期缺漏、過期或來自現貨備援；停止此層判斷';
    }
    if(reason)return {...spec,status:'BLOCKED',trend:'待核對',reason};
    const dirs=selected.map(direction);
    const trend=dirs.every(d=>d==='bull')?'多頭同向':dirs.every(d=>d==='bear')?'空頭同向':dirs.includes('bull')&&dirs.includes('bear')?'週期分歧':'整理／尚未同向';
    const anchor=selected.find(f=>f.interval===spec.anchor);
    return {...spec,status:'VALID',trend,bias:trend==='多頭同向'?'bull':trend==='空頭同向'?'bear':'wait',
      anchor,frames:selected.map(f=>({interval:f.interval,direction:direction(f)})),
      validUntil:Math.min(updated+OUTLOOK_TTL,record.checkedAt+OUTLOOK_TTL,...selected.map(f=>f.outlook.validUntil))};
  });
  const ready=horizons.filter(h=>h.status==='VALID');
  const biases=new Set(ready.map(h=>h.bias).filter(x=>x!=='wait'));
  return {symbol:technical?.symbol || record?.symbol || '',updatedAt:technical?.updatedAt,horizons,
    overview:ready.length!==3?'部分週期資料不足，先補齊再判斷整體方向':biases.size>1?'短中長方向分歧，優先等待衝突收斂':ready.every(h=>h.bias==='bull')?'短中長偏多同向，觀察回調或突破條件':ready.every(h=>h.bias==='bear')?'短中長偏空同向，觀察反彈受阻或跌破條件':'趨勢尚未全面同向，先觀察再擬定計畫'};
}
