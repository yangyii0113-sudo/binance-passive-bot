'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createOfficialSourceBindings}=require('../v12/staging/official_source_binding.js');

const receivedAt=Date.parse('2026-09-10T12:00:00Z');
function staticLoader(sourceId,payload){
  return Object.freeze({load:async()=>Object.freeze({status:'AVAILABLE',sourceId,fetchStartedAt:receivedAt-10,receivedAt,data:payload,researchOnly:true,executionWrite:false})});
}
function payload(seriesID,value){
  return {status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID,data:[{year:'2026',period:'M08',periodName:'August',latest:'true',value:String(value)}]}]}};
}
function binding(seriesID,entityId,field,unit,value){
  return createOfficialSourceBindings().blsSeries({
    loader:staticLoader('bls-public',payload(seriesID,value)),
    definitions:{[seriesID]:{entityId,scope:'US',field,unit}}
  });
}

test('different BLS series get different dataset lineage identities',async()=>{
  const cpi=await binding('CUUR0000SA0','MACRO:US:CPI','inflation.cpi_index','INDEX',326.5).load();
  const unemployment=await binding('LNS14000000','MACRO:US:UNEMPLOYMENT','labor.unemployment_rate','PCT',4.2).load();
  const payroll=await binding('CES0000000001','MACRO:US:PAYROLL','employment.nonfarm_payroll','THOUSANDS',159500).load();

  assert.equal(cpi.lineageMeta.datasetId,'BLS:CUUR0000SA0');
  assert.equal(unemployment.lineageMeta.datasetId,'BLS:LNS14000000');
  assert.equal(payroll.lineageMeta.datasetId,'BLS:CES0000000001');
  assert.equal(new Set([cpi.lineageMeta.datasetId,unemployment.lineageMeta.datasetId,payroll.lineageMeta.datasetId]).size,3);
  for(const row of [cpi,unemployment,payroll]){
    assert.equal(row.status,'AVAILABLE');
    assert.equal(row.lineageMeta.sourceId,'bls-public');
    assert.equal(row.lineageMeta.canonicalSchemaVersion,'foxyya-context-observation/1');
    assert.equal(row.lineageMeta.researchOnly,true);
    assert.equal(row.lineageMeta.executionWrite,false);
  }
});
