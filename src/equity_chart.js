import { escapeHtml, displayDate, finiteNumber } from './ui.js';

const amount = value => value.toLocaleString('zh-TW',{maximumFractionDigits:2});

export function equityChart(curve, {kind = 'backtest', local = false} = {}) {
  const title = kind === 'backtest' ? '歷史回測權益' : local ? '本機模擬已實現餘額' : '雲端模擬權益';
  const note = kind === 'backtest' ? '僅呈現回測已記錄的節點；並非實際交易績效。'
    : local ? '依已平倉交易結算，含已記錄成本；不含未平倉浮動損益。'
    : '依唯讀快照中的權益資料繪製；未提供的資料不補造。';
  const segments = [];
  let segment = [], invalid = 0;
  for (const item of Array.isArray(curve) ? curve : []) {
    const rawTime = item?.time ?? item?.time_ms;
    const time = typeof rawTime === 'number' ? rawTime : typeof rawTime === 'string' && rawTime.trim() ? Date.parse(rawTime) : NaN;
    const rawValue = item?.nav ?? item?.balance;
    const value = finiteNumber(rawValue);
    if (!Number.isFinite(time) || !Number.isFinite(new Date(time).getTime()) || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment);
      segment = []; invalid++; continue;
    }
    // An out-of-order timestamp starts a separate segment rather than drawing backwards.
    if (segment.length && time < segment.at(-1).time) { segments.push(segment); segment = []; }
    segment.push({time,value});
  }
  if (segment.length) segments.push(segment);
  const points = segments.flat();
  if (!points.length) return `<figure class="equity-chart"><figcaption>${title}（USDT）</figcaption><div class="empty-state"><strong>尚無可繪製的權益資料</strong><span>${note}</span></div></figure>`;
  const min = points.reduce((v,p)=>Math.min(v,p.value),Infinity);
  const max = points.reduce((v,p)=>Math.max(v,p.value),-Infinity);
  const start = points.reduce((v,p)=>Math.min(v,p.time),Infinity);
  const end = points.reduce((v,p)=>Math.max(v,p.time),-Infinity);
  const x = point => end === start ? 300 : 8 + (point.time-start)/(end-start)*584;
  const y = point => max === min ? 90 : 164 - (point.value-min)/(max-min)*148;
  const coordinate = value => value.toFixed(2);
  const paths = segments.filter(s=>s.length>1).map(s=>`<path data-equity-segment d="M ${coordinate(x(s[0]))},${coordinate(y(s[0]))} ${s.slice(1).map(p=>`H ${coordinate(x(p))} V ${coordinate(y(p))}`).join(' ')}"/>`).join('');
  const dots = segments.map(s=>{const p=s.at(-1);return `<circle cx="${coordinate(x(p))}" cy="${coordinate(y(p))}" r="3"/>`;}).join('');
  return `<figure class="equity-chart">
    <figcaption>${title}（USDT）</figcaption>
    <div class="equity-values"><span>最低 <strong>${amount(min)}</strong></span><span>最高 <strong>${amount(max)}</strong></span></div>
    <svg role="img" aria-label="${escapeHtml(`${title}，${points.length} 個有效節點；最低 ${amount(min)}，最高 ${amount(max)} USDT`)}" viewBox="0 0 600 180" preserveAspectRatio="none">
      <line class="equity-grid" x1="8" y1="16" x2="592" y2="16"/><line class="equity-grid" x1="8" y1="90" x2="592" y2="90"/><line class="equity-grid" x1="8" y1="164" x2="592" y2="164"/>
      ${paths}${dots}
    </svg>
    <div class="equity-dates"><time>${displayDate(start)}</time><time>${displayDate(end)}</time></div>
    <p>${points.length} 個有效節點${invalid ? ` · 略過 ${invalid} 筆無效資料，缺口不連線` : ''}。${note}</p>
  </figure>`;
}
