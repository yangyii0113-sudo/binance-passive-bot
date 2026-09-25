import { activeForward, advanceForward, emptyForwardBook, expireForward, FEED_GAP_MS, interruptForward, normalizeForwardTick, registerForwardAdvice, tickContinuity } from './advice_forward.js';
import { createForwardStore, exportForwardBook, FORWARD_STORAGE_KEY } from './advice_forward_store.js';

export function createForwardController({storage,locks,WebSocketClass,clock=Date.now,onChange=()=>{},visible=()=>true,interval=setInterval,cancelInterval=clearInterval}={}){
  const store=createForwardStore(storage),feeds=new Map();
  let book=emptyForwardBook(),enabled=false,starting=false,error=null,note='尚未啟動；只記錄啟動後的新分析',releaseLock,timer,epoch=0;
  const view=()=>({book:structuredClone(book),enabled,starting,error,note,feeds:[...feeds].map(([symbol,f])=>({symbol,status:f.status,lastAt:f.last?.receivedAt??null}))});
  const notify=()=>onChange(view());
  const closeFeeds=()=>{for(const f of feeds.values()){f.socket.onmessage=null;f.socket.onclose=null;f.socket.onerror=null;f.socket.close();}feeds.clear();};
  const release=()=>{enabled=false;starting=false;epoch++;cancelInterval(timer);timer=null;closeFeeds();releaseLock?.();releaseLock=null;};
  const fail=e=>{error=String(e?.message||e);release();try{book=store.load();}catch{}notify();};
  const persist=()=>{try{store.save(book);return true;}catch(e){fail(e);return false;}};
  function load(){try{book=store.load();error=null;}catch(e){error=String(e.message);}notify();}
  function stop(reason='使用者停止追蹤；未完成樣本待覆核'){
    if(enabled&&interruptForward(book,reason,clock()))persist();
    note=reason;release();notify();
  }
  function watchSymbol(symbol){
    if(!enabled||!visible()||!/^[\p{L}\p{N}]+USDT$/u.test(symbol))return;
    if(feeds.get(symbol)?.status==='LIVE'||feeds.get(symbol)?.status==='CONNECTING')return;
    for(const [key,f] of feeds)if(key!==symbol&&!book.rows.some(r=>r.symbol===key&&activeForward(r))){f.socket.onclose=null;f.socket.onerror=null;f.socket.onmessage=null;f.socket.close();feeds.delete(key);}
    if(feeds.size>=12&&!feeds.has(symbol)){note='即時行情觀察上限已滿';notify();return;}
    let socket;
    try{socket=new WebSocketClass(`wss://fstream.binance.com/market/ws/${encodeURIComponent(symbol.toLowerCase())}@aggTrade`);}
    catch(e){note=`${symbol} 即時行情無法連線`;notify();return;}
    const f={socket,startedAt:clock(),status:'CONNECTING',last:null,barOpen:null,high:null,low:null};feeds.set(symbol,f);
    const block=reason=>{
      if(feeds.get(symbol)!==f||f.status==='BLOCKED')return;
      f.status='BLOCKED';f.socket.onmessage=null;f.socket.onclose=null;f.socket.onerror=null;f.socket.close();
      if(interruptForward(book,reason,clock(),symbol)&&!persist())return;
      note=`${symbol} ${reason}`;notify();
    };
    f.block=block;
    socket.onerror=()=>block('即時行情連線失敗，待覆核');
    socket.onclose=()=>block('即時行情已中斷，待覆核');
    socket.onmessage=message=>{
      if(!enabled||feeds.get(symbol)!==f)return;
      if(!visible()){stop('頁面進入背景；未完成樣本待覆核');return;}
      let tick;
      try{tick=normalizeForwardTick(JSON.parse(message.data),symbol,clock());}
      catch{block('即時資料異常或延遲，待覆核');return;}
      const continuity=tickContinuity(f.last,tick);
      if(continuity==='duplicate')return;
      if(continuity==='gap'){block('成交序號或時間有缺漏，待覆核');return;}
      const becameLive=f.status!=='LIVE';
      f.status='LIVE';f.last=tick;
      const bar=Math.floor(tick.time/3600000)*3600000;
      if(f.barOpen!==bar){f.barOpen=bar;f.high=tick.price;f.low=tick.price;}
      else{f.high=Math.max(f.high,tick.price);f.low=Math.min(f.low,tick.price);}
      const changed=advanceForward(book,symbol,tick);
      if(changed&&!persist())return;
      if(changed||becameLive)notify();
    };
    notify();
  }
  async function start(){
    if(enabled||starting)return;
    if(!visible()){error='請保持頁面在前景再啟動';notify();return;}
    if(!locks?.request||!WebSocketClass){error='瀏覽器不支援單頁寫入鎖或即時連線，無法安全追蹤';notify();return;}
    starting=true;const requestedEpoch=epoch;error=null;notify();
    // The returned UI promise resolves once acquired; the lock callback stays pending for the session.
    await new Promise(resolve=>{
      locks.request('foxyya-advice-forward-writer',{ifAvailable:true},async lock=>{
        if(!lock){starting=false;error='另一個分頁正在追蹤，請在原分頁操作';notify();resolve();return;}
        const held=new Promise(done=>{releaseLock=done;});
        try{
          if(!visible()||requestedEpoch!==epoch)throw new Error('啟動期間頁面已停止追蹤，請重新啟動');
          book=store.load();
          interruptForward(book,'頁面曾關閉或重整，期間無法確認；不回補',clock());
          store.save(book); // Also prove storage is writable before admitting any sample.
          enabled=true;starting=false;note='追蹤中；請重新分析幣種，只登錄新結果';
          timer=interval(()=>{
            if(!visible()){stop('頁面進入背景；未完成樣本待覆核');return;}
            for(const f of feeds.values())if(f.status!=='BLOCKED'&&clock()-(f.last?.receivedAt??f.startedAt)>FEED_GAP_MS)f.block('超過十秒未收到行情，待覆核');
            if(enabled&&expireForward(book,clock())&&persist())notify();
          },1000);
          notify();
        }catch(e){fail(e);}
        resolve();await held;
      }).catch(e=>{fail(e);resolve();});
    });
  }
  function register(record,ticket=epoch){
    if(!enabled||ticket===null||ticket!==epoch||record?.historical)return;
    if(!visible()){stop('頁面進入背景；未完成樣本待覆核');return;}
    try{
      const f=feeds.get(record.symbol);
      const added=registerForwardAdvice(book,record,{now:clock(),feed:f?.status==='LIVE'?f:null});
      if(added.length&&persist()){note=`已登錄 ${record.symbol} 本次結果；共 ${book.rows.length} 筆`;notify();}
    }catch(e){fail(e);}
  }
  function storageChanged(key){if(key!==FORWARD_STORAGE_KEY&&key!==null)return;if(enabled)fail(new Error('其他頁面變更紀錄，停止追蹤；未完成樣本需覆核'));else load();}
  return {view,load,start,stop,watchSymbol,register,storageChanged,ticket:()=>enabled?epoch:null,export:()=>{if(error)throw new Error('紀錄異常，無法匯出為有效成效');return exportForwardBook(book,clock());}};
}
