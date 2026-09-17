import { SNAPSHOT_TIMEOUT_MS } from '../config.js';

export async function fetchSnapshotJson(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      const error = new Error(`Snapshot HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
