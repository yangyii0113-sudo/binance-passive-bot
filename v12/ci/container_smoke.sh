#!/usr/bin/env bash
set -euo pipefail
# Isolated CI containers: no live market requests, no production mounts or credentials.
tag="foxyya-smoke-${GITHUB_RUN_ID:-$$}"
staging="${tag}-staging"
helper="${tag}-helper"
data="${tag}-data"
backup="${tag}-backup"
cleanup() {
  for name in "$staging" "$helper"; do
    docker logs "$name" 2>&1 | tail -n 12 || true
    docker rm -f "$name" >/dev/null 2>&1 || true
  done
  docker volume rm "$data" "$backup" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Build from each service's selected Railway config; never silently use root railway.toml.
staging_docker=$(python -c 'import tomllib; c=tomllib.load(open("v12/staging/railway.toml","rb")); assert c["build"]["builder"]=="DOCKERFILE"; assert c["deploy"]["healthcheckPath"]=="/ready"; print(c["build"]["dockerfilePath"])')
helper_docker=$(python -c 'import tomllib; c=tomllib.load(open("v12/staging/lineage-backup.railway.toml","rb")); assert c["build"]["builder"]=="DOCKERFILE"; assert c["deploy"]["healthcheckPath"]=="/health"; print(c["build"]["dockerfilePath"])')
docker build -f "$staging_docker" -t "${tag}:staging" .
docker build -f "$helper_docker" -t "${tag}:helper" .
docker volume create "$data" >/dev/null
docker volume create "$backup" >/dev/null
start_staging() {
  docker run -d --name "$staging" --network none \
    -v "$data:/data" -v "$PWD/tests/v12_container_offline_fixture.cjs:/smoke/offline.cjs:ro" \
    -e NODE_OPTIONS=--require=/smoke/offline.cjs -e RAILWAY_GIT_COMMIT_SHA=container-smoke \
    "${tag}:staging" >/dev/null
}
wait_ready() {
  local name="$1" endpoint="$2"
  for attempt in {1..45}; do
    if docker exec -e NODE_OPTIONS= "$name" node -e "fetch('http://127.0.0.1:8080/$endpoint').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then return 0; fi
    sleep 1
  done
  return 1
}
start_staging
wait_ready "$staging" ready
# Trace one genuinely persisted output, then preserve its ID across container replacement.
docker exec -e NODE_OPTIONS= "$staging" node -e '
const assert=require("node:assert/strict"),fs=require("node:fs");
(async()=>{
const r=await fetch("http://127.0.0.1:8080/ready"),state=await r.json();
assert.equal(state.service,"foxyya-v12-staging");assert.equal(state.ready,true);
assert.equal(state.researchOnly,true);assert.equal(state.executionWrite,false);
assert.equal(state.buildRevision,"container-smoke");assert.equal(state.successfulCycles,1);
const probe=await require("/app/v12/staging/lineage_live_trace_probe.js").runLineageLiveTraceProbe({port:8080});
fs.writeFileSync("/data/smoke-ref",probe.lineageRef);
assert.ok(fs.statSync("/data/foxyya-v12.lineage.jsonl").size>0);
})().catch(e=>{console.error(e);process.exit(1)});'
docker rm -f "$staging" >/dev/null
start_staging
wait_ready "$staging" ready
docker exec -e NODE_OPTIONS= "$staging" node -e '
const assert=require("node:assert/strict"),fs=require("node:fs");
(async()=>{const ref=fs.readFileSync("/data/smoke-ref","utf8");
const r=await fetch("http://127.0.0.1:8080/v12/api/lineage/output/"+ref);
assert.equal(r.status,200);assert.equal((await r.json()).data.output.lineageRef,ref);
})().catch(e=>{console.error(e);process.exit(1)});'

start_helper() {
  docker run -d --name "$helper" --network none -v "$backup:/backup" \
    -e FOXYYA_V12_BACKUP_TOKEN=ci-only-token -e FOXYYA_V12_BACKUP_DURABLE=true "${tag}:helper" >/dev/null
}
start_helper
wait_ready "$helper" health
docker exec -e NODE_OPTIONS= "$helper" node -e '
const assert=require("node:assert/strict"),crypto=require("node:crypto");
(async()=>{const h=await (await fetch("http://127.0.0.1:8080/health")).json();
assert.equal(h.service,"foxyya-v12-lineage-backup");assert.equal(h.durableStorage,true);
assert.equal(h.researchOnly,true);assert.equal(h.executionWrite,false);
const raw=Buffer.from("CI backup persistence sample\n"),sha=crypto.createHash("sha256").update(raw).digest("hex");
const r=await fetch("http://127.0.0.1:8080/v1/lineage-backups/smoke",{method:"PUT",body:raw,headers:{authorization:"Bearer ci-only-token","x-foxyya-raw-size":String(raw.length),"x-foxyya-raw-sha256":sha}});
assert.equal(r.status,201);
})().catch(e=>{console.error(e);process.exit(1)});'
docker rm -f "$helper" >/dev/null
start_helper
wait_ready "$helper" health
docker exec -e NODE_OPTIONS= "$helper" node -e '
const assert=require("node:assert/strict"),fs=require("node:fs"),zlib=require("node:zlib"),crypto=require("node:crypto");
(async()=>{const r=await fetch("http://127.0.0.1:8080/v1/lineage-backups/smoke",{method:"HEAD",headers:{authorization:"Bearer ci-only-token"}});
assert.equal(r.status,200);
const raw=zlib.gunzipSync(fs.readFileSync("/backup/smoke.lineage.jsonl.gz"));
assert.equal(raw.toString(),"CI backup persistence sample\n");
assert.equal(crypto.createHash("sha256").update(raw).digest("hex"),r.headers.get("x-foxyya-raw-sha256"));
})().catch(e=>{console.error(e);process.exit(1)});'
echo 'Staging and backup images passed default-CMD, isolation and persistent restart checks.'
