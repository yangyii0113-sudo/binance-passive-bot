import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 18080;
const child = spawn('python3', ['staging_server.py'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      return response;
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

try {
  const health = await waitFor(`http://127.0.0.1:${port}/healthz`);
  assert.equal(health.status, 200, 'staging liveness endpoint must be 200 independent of market-data health');
  const healthJson = await health.json();
  assert.equal(healthJson.paper_only, true);
  assert.equal(healthJson.real_order_lock, true);

  const index = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(index.status, 200, 'staging server must serve the Lite shell');
  assert.match(await index.text(), /FOXYYA Lite/);

  for (const path of ['/api/strategy', '/api/paper', '/api/results', '/api/backtest']) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 404, `${path} must degrade to EMPTY until a read-only upstream is configured`);
  }

  console.log('STAGING_SERVER_SMOKE_OK');
} finally {
  child.kill('SIGTERM');
}
