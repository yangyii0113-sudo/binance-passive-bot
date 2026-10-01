import { fetchMarketJson } from './market_request.js';
import {
  CORE_MARKET_SYMBOLS,
  MARKET_SYMBOLS,
  MARKET_MAX_ROWS,
  MARKET_LIQUIDITY_POOL
} from './config.js';
import { readMarketCache, writeMarketCache } from './cache.js';
import { STATUS } from './status.js';

const STABLE_BASES = new Set(['USDC','FDUSD','TUSD','USDP','DAI','USDE']);
let contractCache=null;
let pendingContracts=null;

export function cryptoContractTickers(tickers, contracts) {
  if(!Array.isArray(tickers) || !Array.isArray(contracts?.symbols)) throw new Error('合約清單格式異常');
  const symbols=new Set(contracts.symbols.filter(c=>c && c.status==='TRADING' && c.contractType==='PERPETUAL' && c.quoteAsset==='USDT' && c.underlyingType==='COIN').map(c=>c.symbol));
  return tickers.filter(ticker=>symbols.has(ticker?.symbol));
}

async function fetchCryptoContracts() {
  const age=Date.now()-(contractCache?.checkedAt || 0);
  if(contractCache && age>=0 && age<300000) return contractCache;
  if(pendingContracts) return pendingContracts;
  pendingContracts=(async()=>{
    const data=await fetchMarketJson('contracts');
    contractCache={symbols:data.symbols,checkedAt:Date.now()};
    return contractCache;
  })().finally(()=>{pendingContracts=null;});
  return pendingContracts;
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = n >= 1000 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 5 : 7;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function baseFromSymbol(symbol) {
  return String(symbol || '').replace(/USDT$/,'');
}

function displayFromSymbol(symbol) {
  return `${baseFromSymbol(symbol)} / USDT`;
}

function fallbackIcon(symbol) {
  const base = baseFromSymbol(symbol).replace(/^1000/,'');
  if (base === 'BTC') return '₿';
  if (base === 'ETH') return '◆';
  return base.slice(0,1) || '•';
}

function deriveMarketSummary(rows) {
  const changes = rows.map((row) => row[3]).filter(Number.isFinite);
  if (!changes.length) return { direction: '無資料', sentiment: '無資料' };
  const avg = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  return {
    direction: avg > 1.5 ? '偏多' : avg < -1.5 ? '偏空' : '震盪',
    sentiment: avg > 1 ? '積極' : avg < -1 ? '謹慎' : '中性'
  };
}

function isEligibleTicker(item) {
  if (!item || typeof item !== 'object') return false;
  const symbol = String(item.symbol || '');
  if (!symbol.endsWith('USDT')) return false;
  const base = baseFromSymbol(symbol);
  if (!base || STABLE_BASES.has(base)) return false;
  const price = Number(item.lastPrice);
  const change = Number(item.priceChangePercent);
  const quoteVolume = Number(item.quoteVolume);
  return Number.isFinite(price) && price > 0 &&
    Number.isFinite(change) &&
    Number.isFinite(quoteVolume) && quoteVolume > 0;
}

function strengthScore(changePct, liquidityRank, poolSize) {
  const momentumMagnitude = Math.min(12, Math.abs(Number(changePct) || 0));
  const liquidityPoints = poolSize > 1 ? (1 - liquidityRank / (poolSize - 1)) * 20 : 20;
  return Math.max(0, Math.min(100, 40 + momentumMagnitude * 3.3 + liquidityPoints));
}

function normalizeUniverse(payload) {
  const eligible = payload.filter(isEligibleTicker);
  eligible.sort((a,b) => Number(b.quoteVolume) - Number(a.quoteVolume));
  const liquid = eligible.slice(0, MARKET_LIQUIDITY_POOL);

  const core = CORE_MARKET_SYMBOLS
    .map((item) => eligible.find((ticker) => ticker.symbol === item.symbol))
    .filter(Boolean);

  const merged = [];
  const seen = new Set();
  for (const ticker of [...core, ...liquid]) {
    if (seen.has(ticker.symbol)) continue;
    seen.add(ticker.symbol);
    merged.push(ticker);
    if (merged.length >= MARKET_LIQUIDITY_POOL) break;
  }

  const liquidityIndex = new Map(liquid.map((ticker, index) => [ticker.symbol, index]));
  return merged.map((ticker) => {
    const index = liquidityIndex.get(ticker.symbol);
    const rank = Number.isInteger(index) ? index : liquid.length - 1;
    const score = strengthScore(Number(ticker.priceChangePercent), rank, Math.max(1, liquid.length));
    return [
      fallbackIcon(ticker.symbol),
      displayFromSymbol(ticker.symbol),
      formatPrice(ticker.lastPrice),
      Number(ticker.priceChangePercent),
      Number(ticker.quoteVolume),
      score
    ];
  });
}

async function fetchAllTickers() {
  return fetchMarketJson('tickers');
}

export function cachedMarketSnapshot() {
  const cached = readMarketCache();
  if (!cached || cached.cryptoOnly!==true) return null;
  const summary = deriveMarketSummary(cached.rows);
  return {
    status: STATUS.STALE,
    cryptoOnly:true,
    contractVerifiedAt:cached.contractVerifiedAt,
    updatedAt: cached.updatedAt,
    rows: cached.rows,
    universeRows: Array.isArray(cached.universeRows) ? cached.universeRows : cached.rows,
    universeSize: Number(cached.universeSize) || (Array.isArray(cached.universeRows) ? cached.universeRows.length : cached.rows.length),
    direction: cached.direction || summary.direction,
    sentiment: cached.sentiment || summary.sentiment
  };
}

export async function loadMarketSnapshot() {
  try {
    const [payload,contracts] = await Promise.all([fetchAllTickers(),fetchCryptoContracts()]);
    const universeRows = normalizeUniverse(cryptoContractTickers(payload,contracts));
    if (universeRows.length < CORE_MARKET_SYMBOLS.length) {
      throw new Error('Liquid universe too small');
    }
    const rows = universeRows.slice(0, MARKET_MAX_ROWS);
    const summary = deriveMarketSummary(rows);
    const snapshot = {
      status: STATUS.LIVE,
      error:null,
      marketDiagnostic:null,
      cryptoOnly:true,
      contractVerifiedAt:new Date(contracts.checkedAt).toISOString(),
      updatedAt: new Date().toISOString(),
      rows,
      universeRows,
      universeSize: universeRows.length,
      direction: summary.direction,
      sentiment: summary.sentiment
    };
    writeMarketCache(snapshot);
    return snapshot;
  } catch (error) {
    const cached = cachedMarketSnapshot();
    if (cached) return { ...cached, error,marketDiagnostic:error.marketDiagnostic||null };
    const fallbackRows = MARKET_SYMBOLS.map(({ icon, display }) => [icon, display, '—', null, null, null]);
    return {
      status: STATUS.ERROR,
      updatedAt: null,
      direction: '無資料',
      sentiment: '無資料',
      rows: fallbackRows.slice(0, MARKET_MAX_ROWS),
      universeRows: fallbackRows,
      universeSize: fallbackRows.length,
      error,
      marketDiagnostic:error.marketDiagnostic||null
    };
  }
}

export { normalizeUniverse, strengthScore };
