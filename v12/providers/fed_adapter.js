'use strict';
const E=require('../data/context_event.js');
const descriptor=Object.freeze({id:'fed-official',sourceLabel:'Board of Governors of the Federal Reserve System official feeds',markets:['US'],capabilities:['NEWS','MACRO','CALENDAR'],transport:'PUBLIC_READ_ONLY',executionWrite:false,priority:50,serverOnly:true});
const FEED_MAP=Object.freeze({MONETARY_POLICY:'MONETARY_POLICY',SPEECH:'SPEECH',PRESS_RELEASE:'REGULATORY'});
function publicationMs(value){const ms=Date.parse(String(value??''));if(!Number.isFinite(ms))throw Error('PUBLISHED_AT_INVALID');return ms;}
function officialUrl(value){const s=String(value??'');if(!/^https:\/\/(?:www\.)?federalreserve\.gov\//i.test(s))throw Error('FED_URL_INVALID');return s;}
function normalizeFeedItems(items,{receivedAt,feedType}){
 if(!Array.isArray(items))throw Error('ITEMS_REQUIRED');const category=FEED_MAP[feedType];if(!category)throw Error('FEED_TYPE_UNSUPPORTED');
 return Object.freeze(items.map(item=>{const url=officialUrl(item.link);const publishedAt=publicationMs(item.pubDate);const guid=String(item.guid||url);return E.makeContextEvent({eventId:`FED:${guid}`,scope:'US',category,title:String(item.title??''),summary:String(item.description??''),publishedAt,receivedAt,source:`FederalReserve:${feedType}`,url,status:'SNAPSHOT'});}));
}
function normalize(dataset,payload,context={}){if(dataset==='FEED')return normalizeFeedItems(payload,context);throw Error('DATASET_UNSUPPORTED')}
module.exports=Object.freeze({descriptor,FEED_MAP,publicationMs,normalizeFeedItems,normalize});
