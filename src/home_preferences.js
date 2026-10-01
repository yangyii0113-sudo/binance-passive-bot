export const HOME_PREFS_KEY='foxyya.home-preferences.v1';
export const validHomeWatchSymbol=value=>typeof value==='string'&&value.length<=40&&value===value.toUpperCase()&&/^[\p{L}\p{N}]+USDT$/u.test(value);
const validSymbols=symbols=>Array.isArray(symbols)&&symbols.length<=10&&new Set(symbols).size===symbols.length&&symbols.every(validHomeWatchSymbol);
const validSort=sort=>['readiness','strength'].includes(sort);

// Only display preferences belong here; never store quotes, plans or tracking state.
export function loadHomePreferences(storage){
  const fallback={symbols:[],sort:'readiness',error:null};
  let raw;
  try{raw=(storage??globalThis.localStorage).getItem(HOME_PREFS_KEY);}
  catch{return {...fallback,error:'無法讀取已存的關注與排序；目前變更可能僅本次頁面有效。'};}
  if(raw===null)return fallback;
  try{
    if(typeof raw!=='string'||raw.length>4096)throw new Error();
    const data=JSON.parse(raw);
    if(data?.version!==1||!validSymbols(data.symbols)||!validSort(data.sort))throw new Error();
    return {symbols:[...data.symbols],sort:data.sort,error:null};
  }catch{return {...fallback,error:'已存的關注與排序格式異常，未載入；重新設定偏好後才會取代原資料。'};}
}

export function saveHomePreferences({symbols,sort},storage){
  if(!validSymbols(symbols)||!validSort(sort))throw new Error('關注或排序格式異常，未儲存。');
  try{(storage??globalThis.localStorage).setItem(HOME_PREFS_KEY,JSON.stringify({version:1,symbols:[...symbols],sort}));}
  catch{throw new Error('無法儲存關注與排序；變更僅本次頁面有效，重新開啟可能恢復舊設定。');}
}

export function toggleHomeWatch(symbols,symbol){
  if(!validSymbols(symbols)||!validHomeWatchSymbol(symbol))throw new Error('關注幣種格式異常。');
  if(symbols.includes(symbol))return symbols.filter(value=>value!==symbol);
  if(symbols.length===10)throw new Error('最多關注 10 檔；請先在「管理關注清單」移除一檔。');
  return [...symbols,symbol];
}
