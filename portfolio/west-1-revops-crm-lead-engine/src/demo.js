import { readFile } from 'node:fs/promises';
import { InMemoryLeadStore } from './store.js';
import { LeadEngine } from './pipeline.js';
import { MockCrmAdapter } from './adapters.js';

const baseUrl = new URL('../', import.meta.url);
const owners = JSON.parse(await readFile(new URL('fixtures/owners.json', baseUrl), 'utf8'));
const websiteLead = JSON.parse(await readFile(new URL('fixtures/website-hot-lead.json', baseUrl), 'utf8'));

const clock = new Date('2026-09-04T09:30:00Z');
const store = new InMemoryLeadStore({ owners });
const crm = new MockCrmAdapter({
  failurePlan: [{ statusCode: 429, code: 'RATE_LIMITED', retryAfterMs: 0 }],
});
const engine = new LeadEngine({
  store, crm, now: () => new Date(clock), sleep: async () => {},
  config: { slaTimeScale: 1 / 600, salesLeadNotificationTarget: '#sales-leads' },
});

console.log('WEST 1 — Revenue Operations / CRM Lead Engine');
console.log('\n1. Process a HOT website lead (mock CRM returns 429, then succeeds)');
const first = await engine.process('website', websiteLead);
console.log(JSON.stringify(first, null, 2));

console.log('\n2. Replay the same source event');
const duplicate = await engine.process('website', websiteLead);
console.log(JSON.stringify(duplicate, null, 2));

console.log('\n3. Run the compressed SLA worker after 4 seconds');
const slaActions = await engine.runSla(new Date(clock.getTime() + 4000));
console.log(JSON.stringify(slaActions, null, 2));

const snapshot = store.snapshot();
console.log('\n4. Control totals');
console.log(JSON.stringify({
  events: snapshot.events.length,
  contacts: snapshot.contacts.length,
  deals: snapshot.deals.length,
  crmAttempts: snapshot.integrationAttempts.length,
  outboundActions: snapshot.outboundActions.length,
  failedEvents: snapshot.failedEvents.length,
}, null, 2));
