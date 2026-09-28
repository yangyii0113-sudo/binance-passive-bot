const KEY = 'foxyya.candidates.v1';

function now(){ return new Date().toISOString(); }
function cleanSymbol(value){
  return String(value || '').toUpperCase().replace(/\s|\//g,'');
}
function loadRaw(){
  try{
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    if(parsed && Array.isArray(parsed.items)) return parsed;
  }catch(_){}
  return { items: [], updatedAt: null };
}
function saveRaw(book){
  const next = { ...book, updatedAt: now() };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
export function loadCandidatePool(){
  return loadRaw();
}
export function candidateExists(symbol){
  const target = cleanSymbol(symbol);
  return loadRaw().items.some(item => item.symbol === target);
}
export function upsertCandidate(input = {}){
  const symbol = cleanSymbol(input.symbol);
  if(!symbol) throw new Error('候選標的不可為空');
  const book = loadRaw();
  const index = book.items.findIndex(item => item.symbol === symbol);
  const previous = index >= 0 ? book.items[index] : null;
  const source = input.source || previous?.source || '手動加入';
  const reason = input.reason || previous?.reason || '';
  const next = {
    id: previous?.id || (crypto?.randomUUID ? crypto.randomUUID() : `c-${Date.now()}`),
    symbol,
    assetClass: input.assetClass || previous?.assetClass || 'crypto',
    source,
    reason,
    addedAt: previous?.addedAt || now(),
    updatedAt: now(),
    signal: {
      ...(previous?.signal || {}),
      ...(input.signal || {})
    },
    technical: previous?.technical || null,
    validator: previous?.validator || null,
    risk: previous?.risk || null,
    notes: previous?.notes || ''
  };
  if(index >= 0) book.items[index] = next;
  else book.items.unshift(next);
  return saveRaw(book);
}
export function removeCandidate(symbol){
  const target = cleanSymbol(symbol);
  const book = loadRaw();
  book.items = book.items.filter(item => item.symbol !== target);
  return saveRaw(book);
}
export function updateCandidate(symbol, patch = {}){
  const target = cleanSymbol(symbol);
  const book = loadRaw();
  const index = book.items.findIndex(item => item.symbol === target);
  if(index < 0) throw new Error('找不到候選標的');
  book.items[index] = {
    ...book.items[index],
    ...patch,
    symbol: target,
    updatedAt: now()
  };
  return saveRaw(book);
}
export function resetCandidatePool(){
  localStorage.removeItem(KEY);
}
