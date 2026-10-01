import { MARKET_REFRESH_MS } from './config.js';
import { escapeHtml as esc, displayDate } from './ui.js';

export function marketHealth(market={},now=Date.now()) {
  const at=Date.parse(market.updatedAt),contracts=Date.parse(market.contractVerifiedAt);
  const age=Number.isFinite(at)&&at<=now?Math.floor((now-at)/1000):null;
  let reason='尚未取得可核對行情';
  if(market.status==='ERROR')reason='行情讀取失敗';
  else if(market.status==='STALE')reason='目前只有快取行情，暫停候選判定';
  else if(Number.isFinite(at)&&at>now)reason='行情時間異常，暫停候選判定';
  else if(market.status==='LIVE'&&age!==null){
    if(now-at>MARKET_REFRESH_MS*3)reason='行情已過期，等待更新';
    else if(market.cryptoOnly!==true||!Number.isFinite(contracts)||contracts>now||now-contracts>300000)reason='合約清單待核對';
    else return {key:'fresh',reason:'行情與合約清單已核對',at,age,contracts};
  }
  return {key:'unavailable',reason,at,age,contracts};
}

export function marketHealthView(market={},now=Date.now()) {
  const h=marketHealth(market,now),error=market.error?.message||(typeof market.error==='string'?market.error:'');
  return `<section class="market-health" data-market-health="${h.key}" aria-label="行情資料健康狀態"><strong>${esc(h.reason)}</strong><span>來源：Binance USD-M 公開行情</span><small>最後更新：${Number.isFinite(h.at)?esc(displayDate(h.at)):'尚無紀錄'} · 資料年齡：${h.age===null?'無法核對':`${h.age} 秒`}</small>${h.key==='unavailable'?'<p>資料尚不可用，不代表市場沒有交易機會；暫不列出候選與點位。</p>':'<small>行情可用不代表策略成立；進場仍依各幣種的有效判定。</small>'}${error?`<details data-search="market-health-error"><summary>查看行情錯誤</summary><p>${esc(error)}</p>${market.marketDiagnostic?`<small>檢查端點 ${esc(market.marketDiagnostic.endpoint)} · ${esc(displayDate(market.marketDiagnostic.checkedAt))}${Number.isInteger(market.marketDiagnostic.httpStatus)?` · HTTP ${market.marketDiagnostic.httpStatus}`:' · 未取得 HTTP 狀態'}</small>`:''}</details>`:''}</section>`;
}
