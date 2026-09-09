const test=require('node:test');
const assert=require('node:assert/strict');
const {
  SOURCE_STATUS,
  SOURCE_CATALOG,
  validateSourceCatalog,
  findSources,
}=require('../v12/providers/source_catalog.js');

test('catalog passes structural and safety validation',()=>{
  const result=validateSourceCatalog(SOURCE_CATALOG);
  assert.equal(result.ok,true, result.errors.join(', '));
});

test('secret-bearing providers are always server-only',()=>{
  const secretSources=SOURCE_CATALOG.filter(x=>x.secretRequired===true);
  assert.ok(secretSources.length>=2);
  assert.ok(secretSources.every(x=>x.serverOnly===true));
});

test('unresolved licensed real-time quotes cannot claim LIVE eligibility',()=>{
  const us=SOURCE_CATALOG.find(x=>x.id==='us-equity-realtime');
  const eu=SOURCE_CATALOG.find(x=>x.id==='eu-equity-realtime');
  for(const source of [us,eu]){
    assert.equal(source.status,SOURCE_STATUS.DECISION_REQUIRED);
    assert.equal(source.liveEligible,false);
    assert.equal(source.provider,null);
  }
});

test('slow positioning evidence is classified as confirmation, not early live signal',()=>{
  const cot=SOURCE_CATALOG.find(x=>x.id==='cftc-cot');
  const finra=SOURCE_CATALOG.find(x=>x.id==='finra-research');
  assert.equal(cot.latencyClass,'WEEKLY');
  assert.equal(cot.evidenceRole,'CONFIRMATION');
  assert.notEqual(finra.latencyClass,'REALTIME');
  assert.equal(finra.liveEligible,false);
});

test('canonical catalog rejects scraped authority',()=>{
  const bad=SOURCE_CATALOG.concat({...SOURCE_CATALOG[0],id:'bad-scraper',authority:'SCRAPED'});
  const result=validateSourceCatalog(bad);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.includes('SCRAPED_FORBIDDEN')));
});

test('Taiwan market discovery returns both TWSE and TPEx official sources',()=>{
  const sources=findSources({market:'TW',capability:'EQUITY_REFERENCE'});
  const ids=sources.map(x=>x.id);
  assert.ok(ids.includes('twse-openapi'));
  assert.ok(ids.includes('tpex-openapi'));
  assert.ok(sources.every(x=>x.authority==='OFFICIAL'));
});

test('TWSE OpenAPI and T86 institutional flow are separate canonical sources',()=>{
  const openapi=SOURCE_CATALOG.find(x=>x.id==='twse-openapi');
  const t86=SOURCE_CATALOG.find(x=>x.id==='twse-t86');
  assert.ok(openapi);
  assert.ok(t86);
  assert.equal(openapi.capabilities.includes('INSTITUTIONAL_FLOW'),false);
  assert.equal(t86.capabilities.includes('INSTITUTIONAL_FLOW'),true);
  assert.equal(t86.latencyClass,'EOD_DELAYED');
  assert.equal(t86.evidenceRole,'CONFIRMATION');
  assert.equal(t86.liveEligible,false);
});

test('Taiwan monthly revenue discovery includes both listed and OTC official sources',()=>{
  const ids=findSources({market:'TW',capability:'MONTHLY_REVENUE'}).map(x=>x.id);
  assert.ok(ids.includes('twse-openapi'));
  assert.ok(ids.includes('tpex-openapi'));
});

test('source status vocabulary is explicit and stable',()=>{
  assert.deepEqual(Object.keys(SOURCE_STATUS).sort(),[
    'ADOPTED','DECISION_REQUIRED','EXISTING_CORE','KEY_REQUIRED','REVIEW_REQUIRED'
  ]);
});
