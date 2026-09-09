(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./product_renderer.js'):root.FOXY_V12_PRODUCT_RENDERER);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FOXY_V12_LINEAGE_EVIDENCE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Product){
  'use strict';
  const validRef=value=>/^out_[a-f0-9]{64}$/.test(value);
  const readonly=value=>value?.researchOnly===true&&value?.executionWrite===false;
  function createLineageReadClient({fetchImpl=globalThis.fetch,timeoutMs=15000}={}){
    if(typeof fetchImpl!=='function')throw Error('FETCH_REQUIRED');
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('READ_TIMEOUT_INVALID');
    async function read(lineageRef,signal){
      if(!validRef(lineageRef))throw Error('INVALID_LINEAGE_REF');
      const response=await fetchImpl('/v12/api/lineage/output/'+lineageRef,{method:'GET',signal,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      if(!String(response?.headers?.get('content-type')||'').includes('application/json'))throw Error('CONTENT_TYPE_INVALID');
      const value=await response.json();
      if(!response.ok)return Object.freeze({status:'UNAVAILABLE',lineageRef,reason:response.status===404?'NOT_FOUND':'READ_FAILED'});
      if(value.schemaVersion!=='foxyya-lineage-trace-read/1'||value.status!=='AVAILABLE'||value.lineageRef!==lineageRef||!readonly(value)||!readonly(value.data)||value.data?.output?.lineageRef!==lineageRef||!Array.isArray(value.data.sources)||!Array.isArray(value.data.observations))throw Error('LINEAGE_TRACE_INVALID');
      return Object.freeze({status:'AVAILABLE',data:value,lineageRef});
    }
    return Object.freeze({async load(lineageRef){
      const controller=new AbortController();let timer;
      try{return await Promise.race([read(lineageRef,controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'))},timeoutMs)})])}
      finally{clearTimeout(timer)}
    }});
  }
  function renderEvidence(state){
    const esc=Product.escapeHtml;
    if(state.status==='LOADING')return '<p role="status">正在讀取來源證據…</p>';
    if(state.status!=='AVAILABLE')return `<p role="status">來源證據 UNAVAILABLE · ${esc(state.reason||'READ_FAILED')}</p>${validRef(state.lineageRef)?`<button class="card-action" data-lineage-ref="${state.lineageRef}">重新讀取</button>`:''}`;
    const trace=state.data.data,output=trace.output;
    return `<h3>${esc(output.subjectId)}</h3><p class="muted">RESEARCH · 更新 ${esc(Product.time(output.asOf))}</p><small class="lineage-id">${esc(output.lineageRef)}</small><p>${trace.sources.length} 個來源 · ${trace.observations.length} 筆觀測</p>${trace.sources.map(source=>`<article class="provider-card"><h4>${esc(source.datasetId)}</h4><small>${esc(source.sourceId)} · 取得 ${esc(Product.time(source.receivedAt))}</small><small>Binding ${esc(source.bindingVersion||'UNAVAILABLE')}</small><small>Adapter ${esc(source.adapterVersion||'UNAVAILABLE')}</small><small class="lineage-id">${esc(source.lineageRef)}</small></article>`).join('')}<details class="trace-observations" open><summary>觀測數值（前 100 筆）</summary>${Product.factsHtml(trace.observations.slice(0,100).map(x=>x.observation))}</details><a class="evidence-link" href="/v12/api/lineage/output/${output.lineageRef}" target="_blank" rel="noopener">開啟完整證據 JSON（${trace.observations.length} 筆）↗</a>`;
  }
  function createEvidenceController({client,show}){
    let generation=0;
    return Object.freeze({
      async open(lineageRef){
        if(!validRef(lineageRef))return;
        const own=++generation;
        show({status:'LOADING',lineageRef});
        let result;
        try{result=await client.load(lineageRef)}catch(_error){result={status:'UNAVAILABLE',reason:'READ_FAILED',lineageRef}}
        if(own===generation)show(result);
      },
      close(){generation++}
    });
  }
  function bindEvidence(doc,options={}){
    const dialog=doc.querySelector('#lineage-dialog'),content=doc.querySelector('#lineage-content');
    if(!dialog||!content)return null;
    const controller=createEvidenceController({client:createLineageReadClient(options),show:state=>{
      content.innerHTML=renderEvidence(state);
      if(!dialog.open)dialog.showModal();
    }});
    dialog.addEventListener('close',()=>controller.close());
    doc.addEventListener('click',event=>{
      if(event.target.closest('[data-close-lineage]')){dialog.close();return}
      const link=event.target.closest('[data-lineage-ref]');
      if(!link)return;
      event.preventDefault();
      return controller.open(link.dataset.lineageRef);
    });
    return controller;
  }
  return Object.freeze({createLineageReadClient,renderEvidence,createEvidenceController,bindEvidence});
});
