import { displayStatus, displayStrategyMatch, displayTimeframe, displayRange } from './display.js';

const KEY = 'foxyya.research.history.v1';
const MAX_RUNS = 20;

function now(){ return new Date().toISOString(); }

function compactRow(item = {}){
  return {
    rank:item.rank ?? null,
    symbol:item.symbol || '',
    researchScore:item.researchScore ?? null,
    marketScore:item.marketScore ?? null,
    tradabilityStatus:item.tradabilityStatus || null,
    baseStrategyMatch:item.baseStrategyMatch || null,
    strategyMatch:item.strategyMatch || null,
    technical:item.technical ? {
      status:item.technical.status,
      updatedAt:item.technical.updatedAt,
      consensus:item.technical.consensus,
      bullish:item.technical.bullish,
      bearish:item.technical.bearish,
      source:item.technical.source,
      frames:Array.isArray(item.technical.frames)
        ? item.technical.frames.map(frame=>({
            interval:frame.interval,
            label:frame.label,
            status:frame.status,
            direction:frame.direction,
            score:frame.score,
            momentumPct:frame.momentumPct,
            samples:frame.samples,
            closedAt:frame.closedAt
          }))
        : []
    } : null,
    technicalError:item.technicalError || null,
    spec:item.spec || null,
    backtest:item.backtest ? {
      status:item.backtest.status,
      updatedAt:item.backtest.updatedAt,
      input:item.backtest.input,
      result:item.backtest.result,
      equityCurve:[]
    } : null,
    guard:item.guard || null,
    risk:item.risk || null,
    decision:item.decision || null,
    status:item.status || null,
    error:item.error || null
  };
}

function normalizeRun(run){
  return {
    id:run?.id || run?.completedAt || run?.updatedAt || now(),
    startedAt:run?.startedAt || null,
    completedAt:run?.completedAt || run?.updatedAt || now(),
    total:Number(run?.total) || 0,
    rows:Array.isArray(run?.rows) ? run.rows.map(compactRow) : []
  };
}

export function loadResearchHistory(){
  try{
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    if(parsed && Array.isArray(parsed.runs)){
      return { runs:parsed.runs.map(normalizeRun).slice(0,MAX_RUNS), updatedAt:parsed.updatedAt || null };
    }
  }catch(_){}
  return { runs:[], updatedAt:null };
}

export function appendResearchRun(run){
  const book = loadResearchHistory();
  const next = normalizeRun(run);
  const deduped = book.runs.filter(item=>item.id !== next.id);
  const runs = [next,...deduped].slice(0,MAX_RUNS);
  const payload = { runs, updatedAt:now() };
  localStorage.setItem(KEY,JSON.stringify(payload));
  return payload;
}

export function clearResearchHistory(){
  localStorage.removeItem(KEY);
  return { runs:[], updatedAt:null };
}

export function latestResearchRun(){
  return loadResearchHistory().runs[0] || null;
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  // Text that spreadsheets interpret as a formula must stay literal.
  if (typeof value === 'string' && /^[\s]*[=+\-@]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}

export function researchExport(history, {format = 'json', id} = {}) {
  const runs = Array.isArray(history?.runs) ? history.runs.slice(0, MAX_RUNS) : [];
  if (!runs.length) throw new Error('尚無研究歷史可匯出');
  if (format === 'json') {
    return {
      filename:'foxyya-research-history.json', mime:'application/json;charset=utf-8',
      text:JSON.stringify({schema:'foxyya-research-export/1',exportedAt:now(),source:'browser-local',historical:true,paperOnly:true,realOrderLocked:true,runs},null,2)
    };
  }
  if (format !== 'csv') throw new Error('不支援的匯出格式');
  const run = runs.find(item => item.id === id);
  if (!run) throw new Error('找不到指定的研究紀錄');
  const table = [['完成時間','幣種','研究評分','歷史結論（非即時）','策略匹配','回測週期','回測期間','交易筆數','勝率（%）','獲利因子','淨報酬率（%）','最大回撤（%）','曝險狀態','資料來源']];
  for (const item of run.rows || []) {
    const result = item.backtest?.result || {};
    const input = item.backtest?.input || {};
    table.push([run.completedAt,item.symbol,item.researchScore,displayStatus(item.decision?.label || item.status),displayStrategyMatch(item.strategyMatch),displayTimeframe(input.timeframe),displayRange(input.range),result.trades,result.winRatePct,result.profitFactor,result.netReturnPct,result.maxDrawdownPct,displayStatus(item.risk?.status),input.dataSource]);
  }
  return {filename:'foxyya-research-selected.csv',mime:'text/csv;charset=utf-8',text:'\uFEFF' + table.map(row=>row.map(csvCell).join(',')).join('\r\n')};
}
