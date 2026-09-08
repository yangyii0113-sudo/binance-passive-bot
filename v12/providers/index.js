'use strict';
const contract=require('./provider_contract.js');
const registry=require('./registry.js');
module.exports=Object.freeze({...contract,...registry});