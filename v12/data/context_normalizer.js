'use strict';
const C=require('./contracts.js');
function makeContextObservation(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INPUT_REQUIRED');
  const value={schemaVersion:'foxyya-context-observation/1',entityId:input.entityId,scope:input.scope,field:input.field,value:input.value,unit:input.unit,observedAt:input.observedAt,receivedAt:input.receivedAt,source:input.source,status:input.status,confidence:input.confidence};
  const result=C.validateContextObservation(value);
  if(!result.ok)throw Error('CONTEXT_OBSERVATION_INVALID:'+result.errors.join('|'));
  return Object.freeze(value);
}
module.exports=Object.freeze({makeContextObservation});
