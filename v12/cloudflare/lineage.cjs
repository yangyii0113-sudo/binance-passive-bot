'use strict';
const L=require('../data/source_lineage.js');
function createCycleLineage(records=[]){
 const sources=new Map(),outputs=new Map(),identities=new Map();
 function recordSource(raw){
  const value=L.validateSourceObservationLineage(raw),key='s:'+L.sourceIdentityKey(value);
  if(identities.has(key)&&identities.get(key)!==value.lineageRef)throw Error('SOURCE_LINEAGE_CONFLICT');
  const status=sources.has(value.lineageRef)?'IDEMPOTENT':'RECORDED';
  identities.set(key,value.lineageRef);sources.set(value.lineageRef,value);return {status,lineageRef:value.lineageRef};
 }
 function recordOutput(raw){
  const value=L.validateResearchOutputLineage(raw),key='o:'+L.outputIdentityKey(value);
  if(identities.has(key)&&identities.get(key)!==value.lineageRef)throw Error('RESEARCH_OUTPUT_LINEAGE_CONFLICT');
  const refs=new Set();
  for(const ref of value.sourceLineageRefs){const s=sources.get(ref);if(!s)throw Error('SOURCE_LINEAGE_REF_UNKNOWN');if(s.receivedAt>value.asOf)throw Error('LINEAGE_TIME_ORDER_INVALID');for(const r of s.observationRefs)refs.add(r)}
  for(const ref of value.observationRefs)if(!refs.has(ref))throw Error('OBSERVATION_REF_UNKNOWN');
  const status=outputs.has(value.lineageRef)?'IDEMPOTENT':'RECORDED';identities.set(key,value.lineageRef);outputs.set(value.lineageRef,value);return {status,lineageRef:value.lineageRef};
 }
 function traceOutput(ref){
  const output=outputs.get(ref);if(!output)return null;
  const selected=output.sourceLineageRefs.map(r=>sources.get(r)),observations=new Map();
  for(const s of selected)s.observationRefs.forEach((r,i)=>observations.set(r,{observationRef:r,sourceLineageRef:s.lineageRef,observation:s.observations[i]}));
  return {output,sources:selected,observations:output.observationRefs.map(r=>observations.get(r)),researchOnly:true,executionWrite:false};
 }
 for(const r of records.filter(r=>r.schemaVersion===L.SOURCE_LINEAGE_SCHEMA))recordSource(r);
 for(const r of records.filter(r=>r.schemaVersion===L.RESEARCH_OUTPUT_LINEAGE_SCHEMA))recordOutput(r);
 if(records.length!==sources.size+outputs.size)throw Error('LINEAGE_RECORDS_INVALID');
 return {recordSource,recordOutput,source:r=>sources.get(r)||null,output:r=>outputs.get(r)||null,traceOutput,records:()=>[...sources.values(),...outputs.values()]};
}
module.exports={createCycleLineage};
