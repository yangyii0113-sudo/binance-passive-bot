'use strict';
const contracts=require('./contracts.js');
const assembler=require('./assembler.js');
module.exports=Object.freeze({...contracts,...assembler});