// Display-only translations. Persisted codes and decision comparisons stay unchanged.
const STATUS_ZH = Object.freeze({
  PASS:'通過', CAUTION:'注意', BLOCKED:'阻擋', REVIEW:'需複核',
  READY:'就緒', SETUP:'條件形成中', WATCH:'觀察中', LIVE:'即時',
  STALE:'已過期', ERROR:'錯誤', LOADING:'載入中', PENDING:'待處理',
  VALIDATED:'已驗證', INSUFFICIENT:'樣本不足', DONE:'完成',
  TRIGGERED:'已觸發', HIGH:'高強度', EMPTY:'無資料', UNSCANNED:'未檢查',
  RESEARCH:'研究中', RUNNING:'執行中', UNKNOWN:'未知', PRELIMINARY:'初步結果'
});
const PHRASES_ZH = {
  'Fully Closed Signal → Next Bar Open':'完整收盤訊號 → 下一根開盤',
  'EMA20/50':'20／50 期指數均線', 'EMA10/30':'10／30 期指數均線',
  'EMA20':'20 期指數均線', 'EMA50':'50 期指數均線',
  'EMA':'指數移動平均線', 'ATR':'平均真實波幅', 'RSI':'相對強弱指標',
  'VWAP':'成交量加權均價', 'AI':'人工智慧', 'Binance':'幣安',
  'Binance U 本位':'幣安穩定幣本位',
  'Tradability':'可交易性', 'WAIT':'等待條件',
  'USD-M':'穩定幣本位', 'BULLISH':'偏多', 'BEARISH':'偏空', 'NEUTRAL':'中性',
  'LONG':'做多', 'SHORT':'做空', 'SKIP':'略過', 'MIXED':'方向分歧',
  'PAPER_ONLY':'僅限模擬交易', 'REAL_ORDER_LOCK':'真實訂單鎖定',
  'No Backfill':'禁止回填', 'v1':'第一版',

  'Momentum / Breakout Watch':'動能／突破觀察', 'Trend / Momentum':'趨勢／動能',
  'Range Watch':'區間觀察', 'Momentum Watch':'動能觀察', 'NO TRADE':'不交易',
  'Market Scout':'市場偵察', 'Technical Analyst':'技術分析',
  'Strategy Validator':'策略驗證', 'Trade Review Analyst':'交易檢討',
  'Trade Review':'交易檢討', 'News Impact':'新聞影響',
  'Paper Margin Exposure':'模擬保證金曝險', 'Crypto Beta':'加密市場同向風險',
  'Fully Closed Bar':'完整收盤 K 棒', 'PF':'獲利因子', 'NAV':'淨值',
  'Strategy Guard':'策略驗證', 'Exposure Gate':'曝險檢查',
  'Risk / market gate':'風險／市場條件檢查', 'Lite Risk Guard':'輕量版風險限制',
  'Mean Reversion':'均值回歸', 'Top 5':'前五名',
  'Failed to fetch':'資料連線失敗', 'Load failed':'資料讀取失敗', 'fetch failed':'資料連線失敗',
  'BINANCE USD-M':'幣安穩定幣本位永續合約',
  'Binance USD-M public klines':'幣安穩定幣本位永續合約公開 K 線',
  'Binance Spot public klines':'幣安現貨公開 K 線',
  'Binance USD-M Public Data':'幣安穩定幣本位永續合約公開資料',
  Research:'研究', Trend:'趨勢', Momentum:'動能', Breakout:'突破', Range:'區間',
  Baseline:'基準', baseline:'基準', Edge:'策略優勢', Paper:'模擬交易',
  Preliminary:'初步結果', fallback:'備援', Kline:'K 線', Crypto:'加密資產', Beta:'市場敏感度'
};
const tokens = Object.keys({...PHRASES_ZH,...STATUS_ZH}).sort((a,b)=>b.length-a.length);
const pattern = new RegExp(`\\b(${tokens.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})\\b`,'g');
export function displayStatus(value) {
  const raw = String(value ?? '').trim();
  return STATUS_ZH[raw.toUpperCase()] || raw || '待檢查';
}
export function displayText(value) {
  return String(value ?? '').replace(pattern, x => PHRASES_ZH[x] || STATUS_ZH[x]);
}
export function displayStrategyMatch(value) {
  return displayText(value) || '待判定';
}
export function displayTimeframe(value) {
  return ({'15m':'15 分鐘','1h':'1 小時','4h':'4 小時','12h':'12 小時','1d':'日線','1w':'週線','1M':'月線'})[value] || value || '—';
}
export function displayRange(value) {
  return String(value || '—').replace(/^(\d+)D$/, '$1 天').replace(/^(\d+)Y$/, '$1 年');
}
