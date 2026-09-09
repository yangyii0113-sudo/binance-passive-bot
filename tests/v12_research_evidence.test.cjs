const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../v12/research/contracts.js');
const {aggregateDimensions}=require('../v12/research/evidence.js');
const e=(dimension,score,source='fixture',confidence=1,status='LIVE',extra={})=>({dimension,score,source,confidence,status,asOf:1000,label:dimension,...extra});

test('no evidence is unavailable and reports all missing dimensions',()=>{
  const r=aggregateDimensions(R.US_DIMENSIONS,[],2000);
  assert.equal(r.direction,'UNAVAILABLE');
  assert.deepEqual(r.missingDimensions,R.US_DIMENSIONS);
  assert.equal(r.confidence,0);
});

test('stale evidence cannot improve coverage or confidence',()=>{
  const base=[e('TREND',.8),e('MOMENTUM',.7)];
  const a=aggregateDimensions(R.US_DIMENSIONS,base,2000);
  const b=aggregateDimensions(R.US_DIMENSIONS,[...base,e('FLOW',.9,'old',1,'STALE')],2000);
  assert.equal(a.confidence,b.confidence);
  assert.deepEqual(a.missingDimensions,b.missingDimensions);
});

test('duplicate source and dimension cannot inflate evidence',()=>{
  const r=aggregateDimensions(R.US_DIMENSIONS,[e('TREND',.4,'same',.5),e('TREND',.8,'same',1)],2000);
  assert.equal(r.evidence.length,1);
  assert.equal(r.evidence[0].score,.8);
});

test('contradictions inside a dimension are preserved',()=>{
  const r=aggregateDimensions(R.US_DIMENSIONS,[e('TREND',.8,'a'),e('TREND',-.7,'b')],2000);
  assert.equal(r.contradictions.length,1);
});