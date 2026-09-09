'use strict';
const contracts=require('./contracts.js');
const fusion=require('./fusion.js');
const evidence=require('./evidence_builders.js');
module.exports=Object.freeze({...contracts,...fusion,...evidence});