import { escapeHtml as esc } from './ui.js';

// Exact reviewed identities only. Never guess a logo URL or strip a contract multiplier.
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
 return {contract:valid?contract:'未知幣種',ticker,name:match?.[0]||'',asset:match?.[1]||null};
}
export function coinLogo(symbol, _fallback, large=false) {
 const info=coinInfo(symbol),src=info.asset?new URL(`./assets/coins/${info.asset}`,import.meta.url).href:null;
 return `<span class="coin-logo ${large?'large':''}" aria-hidden="true"><span class="coin-logo-fallback" title="${esc(info.ticker)} 代號">${esc(info.ticker)}</span>${src?`<img class="coin-logo-bundled" src="${esc(src)}" alt="" loading="lazy" decoding="async" onload="this.style.opacity='1';this.previousElementSibling.hidden=true" onerror="this.hidden=true;this.previousElementSibling.hidden=false">`:''}</span>`;
}
export function coinIdentity(symbol,{large=false}={}) {
 const info=coinInfo(symbol);
 return `<div class="coin-identity">${coinLogo(symbol,null,large)}<div class="coin-name"><strong>${esc(info.ticker)}</strong>${info.name?`<span>${esc(info.name)}</span>`:''}<small>${esc(info.contract)}</small></div></div>`;
}
