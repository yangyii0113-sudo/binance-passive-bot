'use strict';
const contracts=require('./contracts.js');
const registry=require('./version_registry.js');
const report=require('./report.js');
module.exports=Object.freeze({...contracts,...registry,...report});