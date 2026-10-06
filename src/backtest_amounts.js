import { finiteNumber } from './ui.js';

export const BACKTEST_CAPITAL = 1000;
export const BACKTEST_VERSION = 'linear-v4';

export function backtestAmounts(snapshot) {
  const initial = finiteNumber(snapshot?.input?.initialCapital);
  const currency = snapshot?.input?.currency;
  if (!(initial > 0) || !/^[A-Z]{3,8}$/.test(currency || '')) {
    return {initialCapital:null,netPnl:null,finalEquity:null,currency:null};
  }
  const result = snapshot?.result || {};
  const pct = finiteNumber(result.netReturnPct);
  const netPnl = finiteNumber(result.netPnl) ?? (pct == null ? null : initial*pct/100);
  return {initialCapital:initial,netPnl,finalEquity:finiteNumber(result.finalEquity) ?? (netPnl == null ? null : initial+netPnl),currency};
}

export function formatBacktestAmount(value, currency, signed = false) {
  if (value == null || !currency) return '—';
  return `${signed && value > 0 ? '+' : ''}${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`;
}

export function backtestAmountFields(snapshot) {
  const amounts = backtestAmounts(snapshot);
  return [
    ['起始資金',formatBacktestAmount(amounts.initialCapital,amounts.currency)],
    ['淨損益金額',formatBacktestAmount(amounts.netPnl,amounts.currency,true)],
    ['期末資金',formatBacktestAmount(amounts.finalEquity,amounts.currency)]
  ];
}

export function backtestAmountNote(snapshot) {
  if (backtestAmounts(snapshot).initialCapital == null) return '起始資金未記錄，金額暫不換算；舊研究請重新驗證。';
  if (snapshot?.input?.calculationVersion !== BACKTEST_VERSION) return '金額依此紀錄的資金基準換算；計算版本與本機現行版本不同，請重新驗證後比較。';
  return `以 1,000 USDT 起始資金、1 倍名目曝險逐筆再投入；單邊手續費 0.05%＋滑價 0.02%，按進出場成交名目計算；未含資金費率與額外跳空。報酬為期間累計，非年化。最大回撤為 OHLC 極值的保守路徑上界，不是可還原的盤中實際路徑；獲利因子以實現損益金額計算。資金歸零即停止，不模擬負餘額或交易所強平。${snapshot?.result?.capitalExhausted ? '本次資金已耗盡。' : ''}EMA 基準採次根開盤進退場；三策略比較採各自門檻與出場規則，不能直接混為同一績效。這是歷史模擬金額，與持倉頁資金分開。`;
}
