#!/usr/bin/env node

const apiBase = (process.env.CONTRACT_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_URL || 'https://sylana-vessel-11447506833.us-central1.run.app').replace(/\/+$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(path, init) {
  const res = await fetch(`${apiBase}${path}`, {
    ...(init || {}),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...((init && init.headers) || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} -> HTTP ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new Error(`${path} returned non-JSON payload: ${text}`);
  }
}

async function run() {
  console.log(`[contracts] API base: ${apiBase}`);

  const health = await getJson('/api/health');
  assert(typeof health === 'object' && health !== null, '/api/health must return object');
  assert(typeof health.ready === 'boolean', '/api/health.ready must be boolean');

  const toolsPayload = await getJson('/tools/available');
  assert(Array.isArray(toolsPayload.tools), '/tools/available.tools must be array');
  for (const tool of toolsPayload.tools) {
    assert(typeof tool.key === 'string' && tool.key.length > 0, 'tool.key must be non-empty string');
  }

  const threadsPayload = await getJson('/api/threads');
  assert(Array.isArray(threadsPayload.threads), '/api/threads.threads must be array');

  const chatPayload = await getJson('/api/chat/sync', {
    method: 'POST',
    body: JSON.stringify({ message: 'contract test ping', personality: 'sylana', active_tools: ['memories'] }),
  });
  assert(typeof chatPayload.response === 'string', '/api/chat/sync.response must be string');
  assert(typeof chatPayload.personality === 'string', '/api/chat/sync.personality must be string');
  assert(chatPayload.thread_id !== undefined, '/api/chat/sync.thread_id must be present');

  const emotion = chatPayload.emotion;
  if (typeof emotion === 'string') {
    assert(emotion.length > 0, '/api/chat/sync.emotion string must be non-empty');
  } else {
    assert(typeof emotion === 'object' && emotion !== null, '/api/chat/sync.emotion must be object or string');
    assert(typeof emotion.category === 'string', '/api/chat/sync.emotion.category must be string');
  }

  console.log('[contracts] PASS');
}

run().catch((err) => {
  console.error('[contracts] FAIL:', err.message || err);
  process.exit(1);
});
