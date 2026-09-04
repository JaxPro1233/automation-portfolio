import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDemoServer } from '../src/server.js';

async function withServer(run) {
  const { server } = await createDemoServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const payload = {
  event_type: 'lead.submitted',
  occurred_at: '2026-09-04T09:30:00Z',
  source_event_id: 'server-test-001',
  lead: {
    first_name: 'Taylor', last_name: 'Reed', email: 'taylor@example.com',
    phone: '+14155550111', company: 'Example Works', territory: 'US-WEST',
    service: 'crm_automation', message: 'We need reliable lead routing for our sales team.', consent: true,
  },
};

test('HTTP demo accepts a lead and keeps duplicate delivery idempotent', async () => {
  await withServer(async (baseUrl) => {
    const send = () => fetch(`${baseUrl}/api/leads/website`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    const first = await send();
    const firstBody = await first.json();
    const second = await send();
    const secondBody = await second.json();
    assert.equal(first.status, 202);
    assert.equal(firstBody.status, 'NOTIFIED');
    assert.equal(second.status, 202);
    assert.equal(secondBody.duplicate, true);

    const state = await fetch(`${baseUrl}/api/state`).then((response) => response.json());
    assert.deepEqual(state.counts, { events: 1, contacts: 1, deals: 1, outboundActions: 1, failedEvents: 0 });
  });
});

test('HTTP demo rejects malformed JSON and does not expose internals', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/leads/website`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not-json',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'INVALID_JSON' });
  });
});
