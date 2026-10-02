// Presentation only: never feed rounded text back into pricing or execution.
export function priceNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string') {
    value=value.trim();
    if (!value || !/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) return null;
    value=value.replace(/,/g,'');
  }
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:null;
}
export function formatPrice(value) {
  const n=priceNumber(value);
  if(n===null)return '—';
  if(n<0.005)return '小於 0.01';
  return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function exactPricesView(fields) {
  const valid=fields.map(([name,value])=>[name,priceNumber(value)]).filter(([,n])=>n!==null);
  if(!valid.length)return '';
  const labels=valid.map(([,n])=>formatPrice(n)),values=valid.map(([,n])=>n);
  if(!labels.includes('小於 0.01')&&new Set(labels).size===new Set(values).size)return '';
  return `<details class="core-disclosure exact-price-values"><summary>查看精確價格</summary><dl class="analysis-metrics">${valid.map(([name,n])=>`<div><dt>${name}</dt><dd>${String(n)} USDT</dd></div>`).join('')}</dl><p>顯示採兩位小數；判定與計算保留原始精度。</p></details>`;
}
