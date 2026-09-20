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
