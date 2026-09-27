import test from 'node:test';
import assert from 'node:assert/strict';
import { openLocalPaperPosition, closeLocalPaperPosition, localPaperSnapshot, localResultsSnapshot } from '../src/local_paper.js';
const storage = new Map();
globalThis.localStorage = {getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const rows = [['₿','BTC / USDT','100',0]];
test('paper open/close persists locally and missing exit quote never fabricates a fill', () => {
  const position = openLocalPaperPosition({symbol:'BTCUSDT',side:'SHORT',leverage:5,margin:100,marketRows:rows});
  assert.equal(localPaperSnapshot(rows).positions.length,1);
  const before = localStorage.getItem('foxyya.paper.local.v1');
  assert.throws(()=>closeLocalPaperPosition(position.id,[]), /市場價格/);
  assert.equal(localStorage.getItem('foxyya.paper.local.v1'),before);
  const trade = closeLocalPaperPosition(position.id,[['₿','BTC / USDT','90',0]]);
  assert.equal(trade.exit,90);
  assert.equal(trade.netPnl,49.6);
  assert.equal(localPaperSnapshot(rows).positions.length,0);
  assert.equal(localResultsSnapshot().summary.trades,1);
  assert.equal(localResultsSnapshot().summary.expectancyR,null);
});
