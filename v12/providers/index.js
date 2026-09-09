'use strict';
const contract=require('./provider_contract.js');
const registry=require('./registry.js');
const catalog=require('./source_catalog.js');
const adapters=Object.freeze({
  twse:require('./twse_adapter.js'),
  tpex:require('./tpex_adapter.js'),
  sec:require('./sec_edgar_adapter.js'),
  bls:require('./bls_adapter.js'),
  fed:require('./fed_adapter.js'),
  cftc:require('./cftc_cot_adapter.js'),
  finra:require('./finra_adapter.js'),
});
module.exports=Object.freeze({...contract,...registry,...catalog,adapters});