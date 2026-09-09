'use strict';
const contract=require('./provider_contract.js');
const registry=require('./registry.js');
const catalog=require('./source_catalog.js');
module.exports=Object.freeze({...contract,...registry,...catalog});