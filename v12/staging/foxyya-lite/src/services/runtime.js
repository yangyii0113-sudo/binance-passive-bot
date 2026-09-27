import { RUNTIME_BRIDGE_CACHE_MS, RUNTIME_ENDPOINTS } from '../config.js';
import { fetchSnapshotJson } from './http.js';

let cachedPayload = null;
let cachedAt = 0;
let inflight = null;

export async function loadRuntimeSnapshot({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedPayload && now - cachedAt < RUNTIME_BRIDGE_CACHE_MS) {
    return cachedPayload;
  }
  if (inflight) return inflight;

  inflight = fetchSnapshotJson(RUNTIME_ENDPOINTS.snapshot)
    .then((payload) => {
      if (payload !== null) {
        cachedPayload = payload;
        cachedAt = Date.now();
      }
      return payload;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export async function loadLatestBacktestPayload() {
  return fetchSnapshotJson(RUNTIME_ENDPOINTS.backtestLatest);
}

export function resetRuntimeBridgeForTests() {
  cachedPayload = null;
  cachedAt = 0;
  inflight = null;
}
