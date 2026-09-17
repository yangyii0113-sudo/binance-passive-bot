'use strict';
const fs=require('node:fs'),path=require('node:path');
const {decoratePreviewIndex}=require('../staging/preview_app.js');
const root=__dirname,assets=path.join(root,'public');
const id=process.argv[2]||process.env.FOXYYA_CF_D1_ID;
if(id&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error('D1_ID_INVALID');
fs.mkdirSync(path.join(assets,'v12-preview'),{recursive:true});fs.mkdirSync(path.join(assets,'staging'),{recursive:true});
const files=['index.html','styles.css','coverage.css','routes.js','home_model.js','home_view_model.js','home_renderer.js','home_dom.js','market_coverage_renderer.js','product_renderer.js','lineage_evidence.js','app.js'];
for(const name of files){
 let body=fs.readFileSync(path.join(root,'../ui',name));
 if(name==='index.html'){
  let html=decoratePreviewIndex(body.toString());
  const start=html.indexOf('<details class="feature-notice">'),end=html.indexOf('</details>',start);
  if(start<0||end<0)throw Error('SCOPE_NOTICE_MISSING');
  html=html.slice(0,start)+'<details class="feature-notice" open><summary>Cloudflare 低用量研究版</summary><p>每 2 小時嘗試更新官方區域研究摘要；資料可能延遲或不可用，請查看各來源時間與覆蓋狀態。</p><p>本版本未連接模擬交易引擎，未提供新增交易績效、個股研究掃描與研究成果追蹤。保留加密貨幣、美國、台灣三市場；缺少憑證或資料的項目顯示不可用。完整 v12 可於 Mac mini 到貨後另行啟用。</p></details>'+html.slice(end+'</details>'.length);
  body=Buffer.from(html);
 }
 fs.writeFileSync(path.join(assets,'v12-preview',name),body);
}
fs.copyFileSync(path.join(root,'../staging/read_client.js'),path.join(assets,'staging/read_client.js'));
const config={name:'foxyya-v12-research',main:'worker.mjs',compatibility_date:'2026-09-16',compatibility_flags:['nodejs_compat'],workers_dev:true,assets:{directory:'./public',binding:'ASSETS',run_worker_first:true},triggers:{crons:['17 */2 * * *']},observability:{enabled:false}};
// No invented production database ID. A no-ID config is for bundle checking only.
if(id)config.d1_databases=[{binding:'DB',database_name:'foxyya-v12-research',database_id:id}];
fs.writeFileSync(path.join(root,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n');
console.log(id?'Prepared assets and D1-bound config.':'Prepared assets and bundle-only config; supply D1 ID before deployment.');
