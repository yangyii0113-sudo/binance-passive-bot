import { activeForward, advanceForward, emptyForwardBook, expireForward, FEED_GAP_MS, interruptForward, normalizeForwardTick, registerForwardAdvice, tickContinuity } from './advice_forward.js';
import { createForwardStore, exportForwardBook, FORWARD_STORAGE_KEY } from './advice_forward_store.js';

export function createForwardController({storage,locks,WebSocketClass,clock=Date.now,onChange=()=>{},onHealth=()=>{},visible=()=>true,interval=setInterval,cancelInterval=clearInterval}={}){
  const store=createForwardStore(storage),feeds=new Map();
  let book=emptyForwardBook(),enabled=false,starting=false,error=null,dataError=null,note='尚未啟動；只記錄啟動後的新分析',releaseLock,timer,epoch=0,generation=0,lastFeeds=[];
  const feedViews=()=>[...feeds].map(([symbol,f])=>({symbol,status:f.status,startedAt:f.startedAt,openedAt:f.openedAt,lastAt:f.last?.receivedAt??null,lastPrice:f.last?.price??null,received:f.received,issue:f.issue,reason:f.reason,closeCode:f.closeCode,diagnosedAt:f.diagnosedAt}));
  const view=()=>({book:structuredClone(book),enabled,starting,error,dataError,note,feeds:feeds.size?feedViews():lastFeeds});
  const notify=()=>onChange(view());
  const disconnect=f=>{if(!f.socket)return;f.socket.onopen=null;f.socket.onmessage=null;f.socket.onclose=null;f.socket.onerror=null;try{f.socket.close();}catch{}};
  const closeFeeds=()=>{if(feeds.size)lastFeeds=feedViews().map(f=>({...f,status:f.status==='BLOCKED'?'BLOCKED':'STOPPED'}));for(const f of feeds.values())disconnect(f);feeds.clear();};
  const release=()=>{enabled=false;starting=false;epoch++;cancelInterval(timer);timer=null;closeFeeds();releaseLock?.();releaseLock=null;};
  const readBook=()=>{try{book=store.load();dataError=null;return true;}catch(e){book=emptyForwardBook();dataError=String(e.message);return false;}};
  const fail=e=>{error=String(e?.message||e);release();readBook();notify();};
  const persist=()=>{try{store.save(book);return true;}catch(e){fail(e);return false;}};
  const ticket=symbol=>enabled?{epoch,symbol,generation:feeds.get(symbol)?.generation??null}:null;
  function load(){readBook();error=dataError;notify();}
  function stop(reason='使用者停止追蹤；未完成樣本待覆核'){
    if(enabled&&interruptForward(book,reason,clock()))persist();
    note=reason;release();notify();
  }
  function watchSymbol(symbol){
    if(!enabled||!visible()||!/^[\p{L}\p{N}]+USDT$/u.test(symbol))return;
    if(['LIVE','CONNECTING','WAITING'].includes(feeds.get(symbol)?.status))return;
    for(const [key,f] of feeds)if(key!==symbol&&!book.rows.some(r=>r.symbol===key&&activeForward(r))){disconnect(f);feeds.delete(key);}
    if(feeds.size>=12&&!feeds.has(symbol)){note='即時行情觀察上限已滿';notify();return;}
    const f={socket:null,generation:++generation,startedAt:clock(),openedAt:null,received:0,issue:null,reason:'',closeCode:null,diagnosedAt:null,status:'CONNECTING',last:null,barOpen:null,high:null,low:null};feeds.set(symbol,f);
    const current=()=>enabled&&feeds.get(symbol)===f&&f.status!=='BLOCKED';
    const block=(reason,issue='INTERRUPTED')=>{
      if(feeds.get(symbol)!==f||f.status==='BLOCKED')return;
      f.status='BLOCKED';f.issue=issue;f.reason=reason;f.diagnosedAt=clock();disconnect(f);
      if(interruptForward(book,reason,clock(),symbol)&&!persist())return;
      note=`${symbol} ${reason}`;notify();
    };
    f.block=block;
    try{f.socket=new WebSocketClass(`wss://fstream.binance.com/market/ws/${encodeURIComponent(symbol.toLowerCase())}@aggTrade`);}
    catch{block('瀏覽器無法建立即時連線；未追蹤成交','CONNECT_FAILED');return;}
    const socket=f.socket;
    socket.onopen=()=>{if(!current()||f.last)return;f.openedAt=clock();f.status='WAITING';notify();};
    socket.onerror=()=>{if(current())block(f.openedAt?'行情連線發生錯誤；未完成樣本待覆核':'即時連線建立失敗；未追蹤成交','SOCKET_ERROR');};
    socket.onclose=e=>{if(current()){f.closeCode=Number.isInteger(e?.code)?e.code:null;block('即時行情已中斷；未完成樣本待覆核','SOCKET_CLOSED');}};
    socket.onmessage=message=>{
      if(!current())return;
      if(!visible()){stop('頁面進入背景；未完成樣本待覆核');return;}
      let tick;
      try{tick=normalizeForwardTick(JSON.parse(message.data),symbol,clock());}
      catch{block('即時資料格式、來源或時間未通過檢查；待覆核','INVALID_TICK');return;}
      const continuity=tickContinuity(f.last,tick);
      if(continuity==='duplicate')return;
      if(continuity==='gap'){block('成交序號或時間有缺漏，待覆核','SEQUENCE_GAP');return;}
      const becameLive=f.status!=='LIVE';
      f.status='LIVE';f.last=tick;f.received++;
      const bar=Math.floor(tick.time/3600000)*3600000;
      if(f.barOpen!==bar){f.barOpen=bar;f.high=tick.price;f.low=tick.price;}
      else{f.high=Math.max(f.high,tick.price);f.low=Math.min(f.low,tick.price);}
      const changed=advanceForward(book,symbol,tick);
      if(changed&&!persist())return;
      if(changed||becameLive)notify();
    };
    notify();
  }
  function reconnect(symbol){
    if(!enabled||!visible()||feeds.get(symbol)?.status!=='BLOCKED')return false;
    note=`正在重新檢查 ${symbol} 行情；舊樣本維持原狀，接通後須重新分析`;
    watchSymbol(symbol);
    return feeds.get(symbol)?.status==='CONNECTING';
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
          dataError=null;lastFeeds=[];
          interruptForward(book,'頁面曾關閉或重整，期間無法確認；不回補',clock());
          store.save(book); // Also prove storage is writable before admitting any sample.
          enabled=true;starting=false;note='追蹤中；請重新分析幣種，只登錄新結果';
          timer=interval(()=>{
            if(!visible()){stop('頁面進入背景；未完成樣本待覆核');return;}
            for(const f of feeds.values())if(f.status!=='BLOCKED'){
              const now=clock(),last=f.last?.receivedAt??f.startedAt;
              if(now<last)f.block('本機時間倒退，停止判定；待覆核','CLOCK_REVERSED');
              else if(now-last>FEED_GAP_MS){
                if(f.last)f.block('超過十秒未收到連續行情；未完成樣本待覆核','TICK_TIMEOUT');
                else if(f.openedAt)f.block('連線已建立，但十秒內未收到首筆合格行情','FIRST_TICK_TIMEOUT');
                else f.block('十秒內未建立即時連線；尚不能判定為資料源故障','CONNECT_TIMEOUT');
              }
            }
            if(enabled&&expireForward(book,clock())&&persist())notify();
            if(enabled&&feeds.size)onHealth({feeds:feedViews()});
          },1000);
          notify();
        }catch(e){fail(e);}
        resolve();await held;
      }).catch(e=>{fail(e);resolve();});
    });
  }
  function register(record,analysisTicket=ticket(record?.symbol)){
    if(!enabled||!analysisTicket||analysisTicket.epoch!==epoch||analysisTicket.symbol!==record?.symbol||analysisTicket.generation!==(feeds.get(record.symbol)?.generation??null)||record?.historical)return;
    if(!visible()){stop('頁面進入背景；未完成樣本待覆核');return;}
    try{
      const f=feeds.get(record.symbol);
      const added=registerForwardAdvice(book,record,{now:clock(),feed:f?.status==='LIVE'?f:null});
      if(added.length&&persist()){note=`已登錄 ${record.symbol} 本次結果；共 ${book.rows.length} 筆`;notify();}
    }catch(e){fail(e);}
  }
  function storageChanged(key){if(key!==FORWARD_STORAGE_KEY&&key!==null)return;if(enabled)fail(new Error('其他頁面變更紀錄，停止追蹤；未完成樣本需覆核'));else load();}
  return {view,load,start,stop,watchSymbol,reconnect,register,storageChanged,ticket,export:()=>{if(dataError)throw new Error('紀錄異常，無法匯出為有效成效');return exportForwardBook(book,clock());}};
}
