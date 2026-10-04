import { escapeHtml as esc } from './ui.js';
import coinLogoCatalog from './assets/coins/catalog.json' with { type: 'json' };

const catalog = new Map(Object.entries(coinLogoCatalog));
const aliases = {'1000SHIB':'SHIB','1000BONK':'BONK','1000LUNC':'LUNC','1000PEPE':'PEPE'};
export const COIN_CATALOG_URL='https://www.binance.com/bapi/asset/v2/public/asset/asset/get-all-asset';
export function safeCoinLogoUrl(value) {
 try { const u=new URL(value); return u.protocol==='https:' && ['bin.bnbstatic.com','ex.bnbstatic.com'].includes(u.hostname) && !u.username && !u.password && !u.port ? u.href : null; } catch { return null; }
}
export function mergeCoinCatalog(rows) {
 if(!Array.isArray(rows))return 0;
 let count=0;
 for(const row of rows) {
  const code=String(row?.assetCode||''),url=safeCoinLogoUrl(row?.logoUrl);
  if(!/^[\p{L}\p{N}]+$/u.test(code)||row.test||row.isLegalMoney||!url)continue;
  catalog.set(code,[String(row.assetName||code).slice(0,120),url]);count++;
 }
 return count;
}
export async function refreshCoinCatalog(fetcher=globalThis.fetch) {
 try {
  const response=await fetcher(COIN_CATALOG_URL,{credentials:'omit',signal:AbortSignal.timeout(8000)});
  if(!response.ok)return 0;
  const data=await response.json();return data.code==='000000'?mergeCoinCatalog(data.data):0;
 } catch { return 0; }
}
export function availableLogoSymbols(){return [...new Set([...catalog.keys(),...Object.keys(identities),...Object.keys(aliases)])].sort();}


// Bundled fallbacks plus exchange-provided exact identities; never guess URLs or strip multipliers.
const identities = {
 BNB:['BNB','bnb.svg'],XRP:['XRP','xrp.svg'],DOGE:['Dogecoin','doge.svg'],ADA:['Cardano','ada.svg'],
 LINK:['Chainlink','link.svg'],AVAX:['Avalanche','avax.svg'],LTC:['Litecoin','ltc.svg'],BCH:['Bitcoin Cash','bch.svg'],
 DOT:['Polkadot','dot.svg'],APT:['Aptos','apt.svg'],TRX:['TRON','trx.svg'],ARB:['Arbitrum','arb.svg'],OP:['Optimism','op.svg'],
 PEPE:['Pepe','pepe.svg'],'1000PEPE':['Pepe · 1,000 倍合約單位','pepe.svg'],
 BTC:['Bitcoin','btc.svg'], ETH:['Ethereum','eth.svg'], SOL:['Solana','sol.svg'],
 QNT:['Quant','qnt.svg'], SEI:['Sei','sei.svg'], NEAR:['NEAR','near.svg'],
 SUI:['Sui','sui.svg'], ENA:['Ethena','ena.svg'], WLD:['World','wld.svg'],
 UNI:['Uniswap','uni.svg'], LYN:['Everlyn AI','lyn.ico'], SAGA:['Saga','saga.svg']
};
export function coinInfo(symbol) {
 const contract=String(symbol||'').toUpperCase().replace(/\s|\//g,'');
 const valid=/^[\p{L}\p{N}]+(?:USDT)?$/u.test(contract);
 const ticker=valid?contract.replace(/USDT$/,''):'未知';
 const match=valid?identities[ticker]:null;
 const remote=valid?catalog.get(ticker)||catalog.get(aliases[ticker]):null;
 const name=match?.[0]||remote?.[0]||'';
 return {contract:valid?contract:'未知幣種',ticker,name:aliases[ticker]&&!match?name+' · 每單位 1,000 枚':name,asset:match?.[1]||null,logoUrl:safeCoinLogoUrl(remote?.[1])};
}
export function coinLogo(symbol, _fallback, large=false) {
 const info=coinInfo(symbol),src=info.asset?new URL(`./assets/coins/${info.asset}`,import.meta.url).href:info.logoUrl;
 return `<span class="coin-logo ${large?'large':''}" aria-hidden="true"><span class="coin-logo-fallback" title="${esc(info.ticker)} 代號">${esc(info.ticker)}</span>${src?`<img class="coin-logo-bundled" src="${esc(src)}" alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async" onload="this.style.opacity='1';this.previousElementSibling.hidden=true" onerror="this.hidden=true;this.previousElementSibling.hidden=false">`:''}</span>`;
}
export function coinIdentity(symbol,{large=false}={}) {
 const info=coinInfo(symbol);
 return `<div class="coin-identity">${coinLogo(symbol,null,large)}<div class="coin-name"><strong>${esc(info.ticker)}</strong>${info.name?`<span>${esc(info.name)}</span>`:''}<small>${esc(info.contract)}</small></div></div>`;
}
