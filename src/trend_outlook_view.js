import { buildTrendOutlook } from './trend_outlook.js';
import { agentPlanStatus } from './agent_trade_plan.js';
import { escapeHtml as esc, displayDate } from './ui.js';

const price=value=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:8}):'—';
const anchorNames={'1h':'1 小時','4h':'4 小時','1d':'日線'};
export function trendOutlookView(technical,record,{now=Date.now(),filter='all',compact=false}={}){
  if(!technical?.symbol)return '';
  const report=buildTrendOutlook(technical,record,now);
  const horizons=report.horizons.filter(h=>filter==='all'||filter===h.key);
  const shortGate=record?.symbol===technical.symbol?agentPlanStatus(record,now):null;
  const cards=horizons.map(h=>{
    if(h.status!=='VALID')return `<article class="outlook-card" data-outlook="${h.key}"><div class="outlook-title"><h4>${h.name} · ${h.window}</h4><span>資料待核對</span></div><p>${h.frameText}</p><p>${esc(h.reason)}</p></article>`;
    const f=h.anchor,e=f.outlook,anchor=anchorNames[h.anchor];
    const action=h.bias==='bull'?'偏多觀察：等待回調守穩或放量突破，不追漲。':h.bias==='bear'?'偏空觀察：等待反彈受阻或放量跌破，不因跌深就猜底。':'觀望：週期尚未同向，先等待方向與結構確認。';
    const invalidate=h.bias==='bull'?`${anchor}收盤跌回 20 期均線下方，或所需週期轉為分歧，撤回偏多觀察。`:h.bias==='bear'?`${anchor}收盤站回 20 期均線上方，或所需週期轉為分歧，撤回偏空觀察。`:'任一方向收盤突破區間仍須重新分析；不可直接沿用整理判斷。';
    const execution=h.key==='intraday'?(shortGate?.key==='plan'?'已有獨立的一小時條件式計畫；仍需核對方向、有效期限與風險。':`目前短線計畫：${shortGate?.label || '尚未擬定'}，不提供新的進場許可。`):'中長期僅提供觀察建議；尚未有此持有週期的獨立進出場驗證，不套用一小時點位。';
    return `<article class="outlook-card" data-outlook="${h.key}">
      <div class="outlook-title"><h4>${h.name} · ${h.window}</h4><span>${h.trend}</span></div><p class="outlook-frames">${h.frameText}</p>
      <p class="outlook-action">${action}</p>
      <p class="outlook-execution">${esc(execution)}</p>
      <details class="core-disclosure" data-search="outlook-${esc(report.symbol)}-${h.key}"><summary>情勢預案、關鍵價與失效條件</summary>
        <p>${anchor}的前 20 根區間（不含最新收盤棒）：<strong>${price(e.rangeLow)}～${price(e.rangeHigh)} USDT</strong>。這是觀察邊界，不是進場、止盈或止損。</p>
        <dl class="core-metrics"><div><dt>已收盤參考價</dt><dd>${price(f.last)} USDT</dd></div><div><dt>20／50 期均線</dt><dd>${price(f.ema20)}／${price(f.ema50)}</dd></div><div><dt>相對前 20 根均量</dt><dd>${e.relativeVolume===null?'無法計算':price(e.relativeVolume)+' 倍'}</dd></div><div><dt>14 根平均真實波幅</dt><dd>${price(e.atr)} USDT</dd></div></dl>
        <ul><li><strong>上行情境：</strong>${anchor}收盤站穩 ${price(e.rangeHigh)} 之上，20 期均線高於 50 期，其他所需週期同向且量能高於前 20 根均量，才列入偏多研究。</li>
        <li><strong>下行情境：</strong>${anchor}收盤跌破 ${price(e.rangeLow)}，20 期均線低於 50 期，其他所需週期同向且量能高於前 20 根均量，才列入偏空研究。</li>
        <li><strong>整理情境：</strong>未形成同向突破，或量能無法確認，維持觀望；不同週期不以票數抵銷衝突。</li>
        <li><strong>失效／重新評估：</strong>${invalidate}</li></ul>
        <p>參考收盤：${displayDate(f.closedAt)}；本次報告有效至 ${displayDate(h.validUntil)}。所有價位均為本次快照，更新後需重新判讀。</p>
      </details>
    </article>`;
  }).join('');
  const body=`<section class="trend-outlook" aria-label="${esc(report.symbol)} 短中長期情勢分析"><div class="outlook-heading"><h3>短中長期情勢分析</h3><span>${esc(report.symbol)} · 僅模擬研究</span></div><p class="outlook-overview">${report.overview}</p><div class="outlook-grid">${cards}</div>
    <p class="outlook-boundary">以上是價格與成交量的條件式推演，未計算勝率。新聞、總經、代幣解鎖與基本面尚未納入；長期技術偏多不等於值得長期持有。</p>
    <details class="core-disclosure" data-search="outlook-method-${esc(report.symbol)}"><summary>分析方法與獲利驗證</summary><p>以最新完整收盤價、20／50 期指數均線判斷方向，所需週期全部同向才標記趨勢同向。區間不含最新收盤棒，真實波幅為最近 14 根簡單平均；各層共用部分週期，不是互相獨立的勝率證據。</p><p>要評估是否具備獲利優勢，需一起檢查成本後每筆平均損益、樣本數、回撤、樣本外與前向紀錄。既有 90 天比較僅對應原有策略，不驗證本報告的預測能力。</p><p>資料缺漏、過期或現貨備援皆停止對應層判斷。正式帳本、淨值與組合風險仍須另外核對；維持模擬研究、實盤鎖定與不補造交易紀錄。</p></details>
    <button type="button" class="secondary-btn" data-agent-analyze="${esc(report.symbol)}">重新分析短中長趨勢</button></section>`;
  return compact?`<details class="core-disclosure" data-search="outlook-advice-${esc(report.symbol)}"><summary>短中長期情勢對照</summary>${body}</details>`:body;
}
