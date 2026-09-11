'use strict';

const LEVELS=Object.freeze(['LOW','MEDIUM','HIGH','CRITICAL']);
const BASE_IMPACT=Object.freeze({EXTREME:90,HIGH:75,MEDIUM:55,LOW:35,UNAVAILABLE:20});
const OFFICIAL_SOURCE=/(federal reserve|sec\b|u\.s\. bureau of labor statistics|\bbls\b|ecb|european central bank|twse|tpex|jpx|krx|bank of japan|bank of korea)/i;
const ESTABLISHED_SOURCE=/(reuters|associated press|\bap\b|bloomberg|cnbc|financial times|wall street journal|coindesk|cointelegraph)/i;

const ASSET_RULES=Object.freeze([
  Object.freeze({pattern:/\bbitcoin\b|\bbtc\b/i,asset:'BTC',market:'CRYPTO'}),
  Object.freeze({pattern:/\bethereum\b|\beth\b/i,asset:'ETH',market:'CRYPTO'}),
  Object.freeze({pattern:/\bchainlink\b|\blink\b/i,asset:'LINK',market:'CRYPTO'}),
  Object.freeze({pattern:/\balgorand\b|\balgo\b/i,asset:'ALGO',market:'CRYPTO'}),
  Object.freeze({pattern:/\bcoinbase\b/i,asset:'COIN',market:'US'}),
  Object.freeze({pattern:/\brobinhood\b/i,asset:'HOOD',market:'US'}),
  Object.freeze({pattern:/\bamc\b/i,asset:'AMC',market:'US'}),
  Object.freeze({pattern:/\bnvidia\b/i,asset:'NVDA',market:'US'}),
  Object.freeze({pattern:/\btsmc\b|台積電/i,asset:'TWSE:2330',market:'TW'})
]);

function finite(value){return typeof value==='number'&&Number.isFinite(value)}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)}
function text(value){return typeof value==='string'&&value.trim().length>0}
function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
function uniqueSorted(values){return Object.freeze([...new Set(values.filter(text))].sort())}

function eventText(row){
  return [row.title,row.summary,row.description,row.source,...(Array.isArray(row.tags)?row.tags:[]),...(Array.isArray(row.assets)?row.assets:[])]
    .filter(text).join(' ');
}

function freshnessWeight(asOf,nowMs){
  if(!finite(asOf)||!finite(nowMs)||nowMs<0)return 0.4;
  const ageHours=Math.max(0,nowMs-asOf)/3600000;
  if(ageHours<=2)return 1;
  if(ageHours<=6)return 0.95;
  if(ageHours<=24)return 0.85;
  if(ageHours<=72)return 0.65;
  return 0.4;
}

function sourceProfile(source){
  const value=text(source)?source:'';
  if(OFFICIAL_SOURCE.test(value))return Object.freeze({bonus:8,confidence:0.92,kind:'OFFICIAL'});
  if(ESTABLISHED_SOURCE.test(value))return Object.freeze({bonus:3,confidence:0.80,kind:'ESTABLISHED'});
  return Object.freeze({bonus:0,confidence:0.62,kind:'OTHER'});
}

function relatedAssets(row,joined){
  const assets=[];
  for(const value of Array.isArray(row.assets)?row.assets:[])if(text(value))assets.push(value.trim().toUpperCase());
  for(const rule of ASSET_RULES)if(rule.pattern.test(joined))assets.push(rule.asset);
  return uniqueSorted(assets);
}

function marketForAsset(asset){
  if(/^TWSE:|^TPEX:/.test(asset))return 'TW';
  if(['BTC','ETH','LINK','ALGO'].includes(asset))return 'CRYPTO';
  if(['COIN','HOOD','AMC','NVDA'].includes(asset))return 'US';
  return null;
}

function relatedMarkets(row,joined,assets){
  const markets=[];
  for(const asset of assets){const market=marketForAsset(asset);if(market)markets.push(market);}
  if(/federal reserve|\bfed\b|\bsec\b|nasdaq|nyse|wall street|u\.s\.|united states|robinhood|\bamc\b|nvidia/i.test(joined))markets.push('US');
  if(/taiwan|台灣|台股|twse|tpex|tsmc|台積電/i.test(joined))markets.push('TW');
  if(/crypto|cryptocurrency|bitcoin|ethereum|blockchain|token|tokenized|tokenised|stablecoin|coinbase|binance|chainlink|algorand|\bkyc\b/i.test(joined))markets.push('CRYPTO');
  if(/ecb|european central bank|eurozone|euro area|european union/i.test(joined))markets.push('EU');
  if(/hong kong|香港|hkex|hang seng|china|中國|a-share/i.test(joined))markets.push('CN_HK');
  if(/japan|日本|jpx|nikkei|bank of japan|\bboj\b/i.test(joined))markets.push('JP');
  if(/korea|韓國|krx|kospi|bank of korea/i.test(joined))markets.push('KR');
  if(/federal reserve|\bfed\b|ecb|central bank|monetary policy|systemic|global liquidity/i.test(joined))markets.push('GLOBAL');
  return uniqueSorted(markets);
}

function topicAndRationale(joined){
  if(/stock token|tokenized securit|tokenised securit|robinhood.*amc|amc.*robinhood/i.test(joined))return Object.freeze({
    topic:'股票代幣化與證券規則',
    rationale:'股票代幣化牽涉證券監管、發行公司權利與第三方代幣產品邊界，可能提高券商與代幣化資產的合規風險。'
  });
  if(/\bkyc\b|identity|privacy|hacker|cybersecurity|personal data/i.test(joined))return Object.freeze({
    topic:'加密身分驗證與資安風險',
    rationale:'身分與 KYC 資料集中會放大資安與隱私風險，可能提高交易所、錢包與金融服務的合規及資料治理成本。'
  });
  if(/federal reserve|\bfed\b|monetary policy|interest rate|enforcement.*bank|bank.*enforcement/i.test(joined))return Object.freeze({
    topic:'聯準會政策與金融監管動態',
    rationale:'聯準會政策與監管變化可能影響美元流動性、銀行風險承擔與全球風險偏好，需追蹤後續市場反應。'
  });
  if(/ecb|european central bank|eurozone|deposit facility|refinancing rate/i.test(joined))return Object.freeze({
    topic:'歐洲央行與歐元區政策動態',
    rationale:'歐洲央行政策會影響歐元流動性、利率預期與歐洲資產定價，並可能透過美元與全球利率連動外溢。'
  });
  if(/chief executive|\bceo\b|executive|leadership|appoint|resign/i.test(joined))return Object.freeze({
    topic:'企業治理與高層異動',
    rationale:'高層異動可能改變公司策略、產品與資本配置，但屬公司級事件，不應直接推論整體市場方向。'
  });
  return Object.freeze({
    topic:'市場重要消息',
    rationale:'此消息具市場關聯性，但單一事件不足以形成多空結論，應與價格、資金流、宏觀與後續官方資訊交叉驗證。'
  });
}

function impactLevel(score){
  if(score>=85)return 'CRITICAL';
  if(score>=65)return 'HIGH';
  if(score>=45)return 'MEDIUM';
  return 'LOW';
}

function evaluateNewsImpact(row,nowMs=Date.now()){
  if(!object(row)||row.kind!=='NEWS'||!text(row.title))throw Error('NEWS_EVENT_REQUIRED');
  if(!finite(nowMs)||nowMs<0)throw Error('NOW_INVALID');
  const rawImpact=String(row.impact||'UNAVAILABLE').toUpperCase();
  const base=BASE_IMPACT[rawImpact]??BASE_IMPACT.UNAVAILABLE;
  const source=sourceProfile(row.source);
  const joined=eventText(row);
  const assets=relatedAssets(row,joined);
  const markets=relatedMarkets(row,joined,assets);
  const macroBonus=/(macro|monetary policy|federal reserve|\bfed\b|ecb|central bank|systemic)/i.test(joined)?5:0;
  const assetBonus=assets.length?4:0;
  const crossMarketBonus=markets.length>=2?3:0;
  const freshness=freshnessWeight(row.asOf,nowMs);
  const score=Math.round(clamp((base+source.bonus+macroBonus+assetBonus+crossMarketBonus)*freshness,0,100));
  let confidence=source.confidence;
  if(text(row.summary)||text(row.description))confidence+=0.03;
  if(Array.isArray(row.tags)&&row.tags.length)confidence+=0.02;
  if(assets.length)confidence+=0.02;
  confidence=Number(clamp(confidence,0,1).toFixed(2));
  const context=topicAndRationale(joined);
  const result={
    impactScore:score,
    impactLevel:impactLevel(score),
    impactConfidence:confidence,
    freshnessWeight:Number(freshness.toFixed(2)),
    relatedMarkets:markets,
    relatedAssets:assets,
    topic:context.topic,
    impactRationale:context.rationale,
    researchOnly:true,
    executionWrite:false
  };
  return Object.freeze(result);
}

module.exports=Object.freeze({LEVELS,evaluateNewsImpact});
