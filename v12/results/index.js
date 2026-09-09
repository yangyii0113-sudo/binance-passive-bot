'use strict';
const contracts=require('./contracts.js');
const crypto=require('./crypto_results.js');
const tracking=require('./research_tracking.js');
module.exports=Object.freeze({...contracts,...crypto,...tracking});