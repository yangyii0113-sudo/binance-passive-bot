'use strict';
const contracts=require('./contracts.js');
const regional=require('./regional_engine.js');
const context=require('./context_engine.js');
module.exports=Object.freeze({...contracts,...regional,...context});