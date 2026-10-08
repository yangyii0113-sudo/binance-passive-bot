// Local SVGs avoid missing icon-font glyphs. Visible adjacent text carries meaning.
const paths={
 clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
 target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
 pause:'<circle cx="12" cy="12" r="8"/><path d="M9 8v8m6-8v8"/>',
 expired:'<path d="M20 10a8 8 0 1 0-10 10M12 7v5l2 1m3 4 4 4m0-4-4 4"/>',
 conflict:'<path d="m4 5 16 14m-5 0h5v-5M4 19 20 5m-5 0h5v5"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5m-4-3a7 7 0 0 1 12-4l3 3M4 16l3 3a7 7 0 0 0 12-4"/>',
 long:'<path d="M5 19 19 5M8 5h11v11"/>',
 short:'<path d="m5 5 14 14M8 19h11V8"/>',
 entry:'<path d="M14 4h6v16h-6M3 12h12m-5-5 5 5-5 5"/>',
 tp1:'<path d="M5 21V4m0 0h14l-3 4 3 4H5"/><path d="M10 6v4"/>',
 tp2:'<path d="M5 21V4m0 0h14l-3 4 3 4H5"/><path d="M9 6v4m3-4v4"/>',
 stop:'<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z"/><path d="M8 12h8"/>',
 next:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>'
};
export function tradeIcon(name){
 if(!Object.hasOwn(paths,name))return '';
 return `<svg class="trade-icon" data-trade-icon="${name}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
export function verdictIcon(key){return tradeIcon(({plan:'target',wait:'clock',empty:'clock',loading:'refresh',blocked:'pause',expired:'expired',conflict:'conflict'})[key]||'pause');}
export function directionIcon(side){return tradeIcon(side==='LONG'?'long':side==='SHORT'?'short':'pause');}
