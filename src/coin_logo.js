import { escapeHtml as esc } from './ui.js';

const bundled = new Set(['btc','eth','sol','qnt','sei','near','sui','ena','wld','uni']);

// Shared by market rows, home candidates and advice. Keep identity visible even
// while an external image is loading or unavailable.
export function coinLogo(symbol, fallback, large = false) {
  const base = String(symbol || '').toUpperCase().replace(/\s|\//g, '').replace(/USDT$/, '').replace(/^1000/, '');
  const code = /^[A-Z0-9]+$/.test(base) ? base.toLowerCase() : '';
  const label = esc(base || '幣種');
  const text = esc(fallback || Array.from(base).slice(0, 3).join('') || '•');
  const src = bundled.has(code) ? new URL(`./assets/coins/${code}.svg`, import.meta.url).href : `https://assets.coincap.io/assets/icons/${code}@2x.png`;
  return `<span class="coin-logo ${large ? 'large' : ''}" aria-hidden="true">
    <span class="coin-logo-fallback" title="${label} 代號">${text}</span>
    ${code ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.style.opacity='1';this.previousElementSibling.hidden=true" onerror="this.hidden=true;this.previousElementSibling.hidden=false">` : ''}
  </span>`;
}
