import { scanPullbacks } from './trend_pullback.js';
import { coinCategory } from './coin_analysis.js';
import { researchRiskScenario } from './research_risk_view.js';

const H = 3600000;
const SNAPSHOT_TTL = 60000;
const blocked = (symbol, reason) => ({ symbol, status:'BLOCKED', reason });
export const normalizePlanSymbol = value => String(value || '').toUpperCase().replace(/\s|\//g,'');

// Public futures data only. This module never persists levels or authorizes orders.
export async function generateAgentTradePlan(value, { fetcher=fetch, scanner=scanPullbacks, clock=Date.now }={}) {
  const symbol = normalizePlanSymbol(value);
  if (!/^[\p{L}\p{N}]+USDT$/u.test(symbol)) return blocked(symbol, '請選擇有效的穩定幣本位合約');
  try {
    const response = await fetcher('https://fapi.binance.com/fapi/v1/exchangeInfo', {cache:'no-store',signal:AbortSignal.timeout(15000)});
    if (!response.ok) return blocked(symbol, '合約清單無法讀取，停止產生點位');
    const contracts = await response.json();
    const contract = contracts?.symbols?.find(x=>x.symbol===symbol);
    if (!contract || contract.status!=='TRADING' || contract.contractType!=='PERPETUAL' || contract.quoteAsset!=='USDT' || contract.underlyingType!=='COIN') {
      return blocked(symbol, '尚未確認為可交易的加密貨幣永續合約，停止產生點位');
    }
    let hourly = null;
    const checkedFetcher = async (url, options) => {
      const result = await fetcher(url, {...options,cache:'no-store'});
      const data = await result.json();
      if (url.includes('interval=1h&')) hourly = data;
      return {ok:result.ok, status:result.status, json:async()=>data};
    };
    const [row] = await scanner([{symbol}], {fetcher:checkedFetcher});
    const now = clock();
    if (!row || row.symbol!==symbol) return blocked(symbol, '分析結果與標的不符，停止產生點位');
    const record = {symbol, status:'LIVE', checkedAt:now, snapshotUntil:now+SNAPSHOT_TTL, row};
    const category = coinCategory(row, now);
    if (category!=='plan') return record;
    // A closed-bar setup cannot be offered as a new entry after its threshold was touched.
    const current = Array.isArray(hourly) && hourly.find(r=>Array.isArray(r) && +r[0]===Math.floor(now/H)*H);
    const currentValid = current && [0,1,2,3,4,6].every(k=>current[k]!==null && current[k]!=='' && Number.isFinite(+current[k])) &&
      Math.min(+current[1],+current[2],+current[3],+current[4])>0 && +current[2]>=Math.max(+current[1],+current[4]) &&
      +current[3]<=Math.min(+current[1],+current[4]) && +current[6]===+current[0]+H-1;
    record.row = {...row, analysis:{...row.analysis, strategies:row.analysis.strategies.map(plan=>{
      if (plan.status!=='SETUP') return plan;
      if (!currentValid) return {...plan,status:'BLOCKED',reason:'缺少當前一小時行情，無法確認是否已錯過進場，請重新產生'};
      if (plan.side==='LONG' ? +current[2]>=plan.entry : +current[3]<=plan.entry) {
        return {...plan,status:'WAIT',reason:'本根已觸及進場門檻，無法當作新的進場機會；等待下一次收盤重新分析'};
      }
      if (plan.side==='LONG' ? +current[3]<=plan.stop : +current[2]>=plan.stop) {
        return {...plan,status:'WAIT',reason:'本根已觸及失效止損位置，取消計畫；等待新訊號'};
      }
      return plan;
    })}};
    return record;
  } catch {
    return blocked(symbol, '無法取得完整合約行情；請稍後重新產生交易計畫');
  }
}

export function agentPlanStatus(record, now=Date.now()) {
  if (!record) return {key:'empty',label:'尚未擬定',reason:'執行技術分析後，會自動核對合約行情並擬定交易計畫。',plans:[]};
  if (record.status==='LOADING') return {key:'loading',label:'擬定中',reason:'正在核對合約、完整收盤資料與當前進場條件…',plans:[]};
  if (record.status!=='LIVE' || record.historical) return {key:'blocked',label:'暫不進場',reason:record.reason || '資料不足或為歷史紀錄，請重新產生交易計畫。',plans:[]};
  const a=record.row?.analysis;
  if (!a || a.status!=='VALID' || !Array.isArray(a.strategies)) return {key:'blocked',label:'暫不進場',reason:a?.reason || record.row?.reason || '完整收盤資料不足，停止產生點位。',plans:[]};
  if (![record.checkedAt, record.snapshotUntil, a.analyzedAt, a.closedAt, a.validUntil].every(Number.isFinite) || record.checkedAt>now || a.analyzedAt>now || a.closedAt>=a.analyzedAt) return {key:'blocked',label:'資料異常',reason:'無法核對資料時間，請重新產生。',plans:[]};
  if (a.validUntil<=now || record.snapshotUntil<=now) return {key:'expired',label:'請更新計畫',reason:'行情核對已超過一分鐘或已換根；舊點位已隱藏，請重新產生。',plans:[]};
  const category=coinCategory(record.row,now);
  if (category==='conflict') return {key:'conflict',label:'方向衝突',reason:'策略出現相反方向，不合併為進場計畫；等待方向釐清。',plans:[]};
  const plans=a.strategies.filter(p=>p.status==='SETUP');
  if (plans.some(p=>!researchRiskScenario(p) || researchRiskScenario(p).netRewardRisk<1 || !Number.isFinite(p.expiresAt) || p.expiresAt<=now || p.expiresAt!==a.validUntil || p.signalAt!==a.closedAt)) {
    return {key:'blocked',label:'點位未通過核對',reason:'方向、成本後風報比或有效期限異常，停止產生點位。',plans:[]};
  }
  return {key:plans.length?'plan':'wait',label:plans.length?'條件式交易計畫':'等待條件',reason:plans.length?'以下為獨立研究方案，尚未確認成交；同幣多方案不可重複累加部位。':'目前沒有可成立的新進場計畫；下方列出各策略等待原因。',plans};
}
