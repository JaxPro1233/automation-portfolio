import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { InMemoryLeadStore } from '../src/store.js';
import { LeadEngine } from '../src/pipeline.js';
import { IntegrationError, MockCrmAdapter } from '../src/adapters.js';
import { adaptLeadEvent, cleanText, normalizePhone } from '../src/normalization.js';
import { scoreLead } from '../src/scoring.js';
import { retryDelayMs, withRetry } from '../src/retry.js';

const root = new URL('../', import.meta.url);
const owners = JSON.parse(await readFile(new URL('fixtures/owners.json', root), 'utf8'));
const fixture = JSON.parse(await readFile(new URL('fixtures/website-hot-lead.json', root), 'utf8'));
const metaFixture = JSON.parse(await readFile(new URL('fixtures/meta-enriched-lead.json', root), 'utf8'));
const fixedNow = new Date('2026-09-04T09:30:00Z');

function clone(value) {
  return structuredClone(value);
}

function setup(options = {}) {
  const store = new InMemoryLeadStore({ owners: clone(owners) });
  const crm = options.crm ?? new MockCrmAdapter(options.crmOptions);
  const engine = new LeadEngine({
    store,
    crm,
    now: () => new Date(fixedNow),
    sleep: options.sleep ?? (async () => {}),
    ai: options.ai,
    config: { salesLeadNotificationTarget: '#sales-leads', ...options.config },
  });
  return { store, crm, engine };
}

function uniqueFixture(sourceEventId, overrides = {}) {
  const value = clone(fixture);
  value.source_event_id = sourceEventId;
  Object.assign(value.lead, overrides);
  return value;
}

test('valid website lead creates one contact, deal, assignment and notification', async () => {
  const { store, engine } = setup();
  const result = await engine.process('website', fixture);
  assert.equal(result.status, 'NOTIFIED');
  assert.equal(result.leadClass, 'HOT');
  assert.equal(store.contacts.size, 1);
  assert.equal(store.deals.size, 1);
  assert.equal(store.routingAssignments.length, 1);
  assert.equal(store.outboundActions.size, 1);
});

test('same source event is idempotent across all side effects', async () => {
  const { store, crm, engine } = setup();
  const first = await engine.process('website', fixture);
  const duplicate = await engine.process('website', fixture);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.eventId, first.eventId);
  assert.equal(store.events.size, 1);
  assert.equal(store.contacts.size, 1);
  assert.equal(store.deals.size, 1);
  assert.equal(store.outboundActions.size, 1);
  assert.equal(crm.calls.filter((call) => !call.failed).length, 2);
});

test('new event with same email updates the contact and reuses an open deal', async () => {
  const { store, engine } = setup();
  const first = await engine.process('website', fixture);
  const repeatPerson = uniqueFixture('form_submission_1002', { phone: null, company: 'Northwind Updated' });
  const second = await engine.process('website', repeatPerson);
  assert.equal(store.contacts.size, 1);
  assert.equal(store.deals.size, 1);
  assert.equal(second.dealId, first.dealId);
  assert.equal([...store.contacts.values()][0].company, 'Northwind Updated');
});

test('phone formatting variants resolve to one contact', async () => {
  const { store, engine } = setup();
  const first = uniqueFixture('phone-1', { email: null, phone: '+1 (415) 555-0184' });
  const second = uniqueFixture('phone-2', { email: null, phone: '4155550184' });
  await engine.process('website', first);
  await engine.process('website', second);
  assert.equal(store.contacts.size, 1);
});

test('lead with only email is accepted', async () => {
  const { engine } = setup();
  const result = await engine.process('website', uniqueFixture('email-only', { phone: null }));
  assert.equal(result.status, 'NOTIFIED');
});

test('lead with only phone and country context is accepted', async () => {
  const { engine } = setup();
  const result = await engine.process('website', uniqueFixture('phone-only', { email: null, phone: '4155550184' }));
  assert.equal(result.status, 'NOTIFIED');
});

test('identity conflict goes to manual review without CRM side effects', async () => {
  const { store, crm, engine } = setup();
  await engine.process('website', uniqueFixture('person-email', { phone: null }));
  await engine.process('website', uniqueFixture('person-phone', { email: 'other@example.net' }));
  const conflict = uniqueFixture('person-conflict', { email: fixture.lead.email, phone: fixture.lead.phone });
  const result = await engine.process('website', conflict);
  assert.equal(result.status, 'MANUAL_REVIEW');
  assert.equal(crm.calls.filter((call) => !call.failed).length, 4);
});

test('unserved territory uses fallback owner', async () => {
  const { engine } = setup();
  const result = await engine.process('website', uniqueFixture('fallback', { territory: 'CA' }));
  assert.equal(result.ownerId, 'owner-fallback');
});

test('round-robin alternates eligible managers', async () => {
  const { engine } = setup();
  const first = await engine.process('website', uniqueFixture('rr-1', { email: 'one@alpha.example', phone: '+14155550101' }));
  const second = await engine.process('website', uniqueFixture('rr-2', { email: 'two@beta.example', phone: '+14155550102' }));
  assert.equal(first.ownerId, 'owner-alex');
  assert.equal(second.ownerId, 'owner-sam');
});

test('AI failure preserves deterministic score and fallback summary', async () => {
  const ai = { summarize: async () => { throw new Error('AI unavailable'); } };
  const { store, engine } = setup({ ai });
  const result = await engine.process('website', fixture);
  assert.equal(result.status, 'NOTIFIED');
  const deal = store.deals.get(result.dealId);
  assert.equal(deal.summaryProvider, 'deterministic-fallback');
  assert.match(deal.summary, /HOT/);
});

test('429 honors Retry-After and then succeeds without duplicate deal', async () => {
  const delays = [];
  const crm = new MockCrmAdapter({ failurePlan: [{ statusCode: 429, code: 'RATE_LIMITED', retryAfterMs: 750 }] });
  const { store, engine } = setup({ crm, sleep: async (ms) => delays.push(ms) });
  const result = await engine.process('website', fixture);
  assert.equal(result.status, 'NOTIFIED');
  assert.deepEqual(delays, [750]);
  assert.equal(store.deals.size, 1);
});

test('503 retries and succeeds', async () => {
  const crm = new MockCrmAdapter({ failurePlan: [{ statusCode: 503, code: 'UNAVAILABLE' }] });
  const { store, engine } = setup({ crm });
  const result = await engine.process('website', fixture);
  assert.equal(result.status, 'NOTIFIED');
  assert.equal(store.integrationAttempts.filter((attempt) => !attempt.ok).length, 1);
});

test('permanent 400 is not retried and creates a failed event', async () => {
  const crm = new MockCrmAdapter({ failurePlan: [{ statusCode: 400, code: 'BAD_REQUEST' }] });
  const { store, engine } = setup({ crm });
  const result = await engine.process('website', fixture);
  assert.equal(result.status, 'FAILED');
  assert.equal(store.integrationAttempts.length, 1);
  assert.equal(store.failedEvents.size, 1);
});

test('five transient failures exhaust retry policy', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls += 1;
      throw new IntegrationError('down', { statusCode: 503, code: 'UNAVAILABLE' });
    }, { sleep: async () => {}, jitter: () => 0 }),
    (error) => error.attempts.length === 5,
  );
  assert.equal(calls, 5);
});

test('manual replay resolves failed event without duplicate business records', async () => {
  const crm = new MockCrmAdapter({ failurePlan: [{ statusCode: 400, code: 'BAD_REQUEST' }] });
  const { store, engine } = setup({ crm });
  const failed = await engine.process('website', fixture);
  const replayed = await engine.replayFailed(failed.eventId, new Date(fixedNow.getTime() + 1000));
  assert.equal(replayed.status, 'NOTIFIED');
  assert.equal(store.contacts.size, 1);
  assert.equal(store.deals.size, 1);
  assert.equal(store.outboundActions.size, 1);
  assert.equal([...store.failedEvents.values()][0].resolutionStatus, 'RESOLVED');
  assert.ok(store.touchpoints.every((touchpoint) => touchpoint.eventId === failed.eventId));
  assert.ok(store.auditLog.filter((entry) => entry.entityType === 'event').every((entry) => entry.entityId === failed.eventId));
});

test('SLA worker emits one reminder and one escalation only', async () => {
  const { store, engine } = setup({ config: { slaTimeScale: 0.001 } });
  const result = await engine.process('website', fixture);
  const later = new Date(fixedNow.getTime() + 2000);
  await engine.runSla(later);
  await engine.runSla(later);
  const actions = [...store.outboundActions.values()].filter((action) => action.type.startsWith('SLA_'));
  assert.equal(actions.filter((action) => action.type === 'SLA_REMINDER').length, 1);
  assert.equal(actions.filter((action) => action.type === 'SLA_ESCALATION').length, 1);
  assert.equal(store.deals.get(result.dealId).stage, 'SLA_BREACHED');
});

test('manager action cancels pending SLA checkpoints', async () => {
  const { store, engine } = setup({ config: { slaTimeScale: 0.001 } });
  const result = await engine.process('website', fixture);
  engine.markDealStage(result.dealId, 'IN_PROGRESS', new Date(fixedNow.getTime() + 100));
  const delivered = await engine.runSla(new Date(fixedNow.getTime() + 3000));
  assert.equal(delivered.length, 0);
  assert.ok(store.slaCheckpoints.every((checkpoint) => checkpoint.status === 'CANCELLED'));
});

test('lead without consent cannot create nurture action', async () => {
  const { store, engine } = setup();
  const result = await engine.process('website', uniqueFixture('no-consent', { consent: false }));
  const nurture = engine.scheduleNurture(result.dealId, new Date(fixedNow.getTime() + 86_400_000));
  assert.deepEqual(nurture, { scheduled: false, reason: 'CONSENT_REQUIRED' });
  assert.equal([...store.outboundActions.values()].filter((action) => action.type === 'NURTURE').length, 0);
});

test('HTML and scripts are removed from free text', () => {
  assert.equal(cleanText('<script>alert(1)</script><b>Need CRM</b>'), 'alert(1) Need CRM');
});

test('logs and notification previews mask contact details', async () => {
  const { store, engine } = setup();
  const result = await engine.process('website', fixture);
  assert.doesNotMatch(result.notificationPreview, /Alex\.Morgan\+demo@example\.com/i);
  assert.doesNotMatch(result.notificationPreview, /14155550184/);
  assert.ok(store.auditLog.every((entry) => !JSON.stringify(entry).includes('Alex.Morgan+demo@example.com')));
});

test('Meta enriched payload is mapped to canonical lead data', () => {
  const event = adaptLeadEvent('meta', metaFixture, { now: fixedNow, defaultCountryCode: '1' });
  assert.equal(event.sourceEventId, 'meta-lead-2001');
  assert.equal(event.lead.firstName, 'Jamie');
  assert.equal(event.lead.emailNormalized, 'jamie@contoso.example');
  assert.equal(event.attribution.formId, 'form-100');
});

test('raw Meta webhook without field data is held for enrichment', async () => {
  const { engine } = setup();
  const result = await engine.process('meta', { leadgen_id: 'raw-1', created_time: 1788514800 });
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.errors, ['META_LEAD_ENRICHMENT_REQUIRED', 'EMAIL_OR_PHONE_REQUIRED']);
});

test('scoring is deterministic and bounded', () => {
  const event = adaptLeadEvent('website', fixture, { now: fixedNow, defaultCountryCode: '1' });
  assert.deepEqual(scoreLead(event), scoreLead(event));
  assert.equal(scoreLead(event).score, 100);
});

test('retry backoff is bounded and deterministic without jitter', () => {
  const error = new IntegrationError('down', { statusCode: 503 });
  assert.equal(retryDelayMs(error, 1, { baseMs: 250, jitter: () => 0 }), 250);
  assert.equal(retryDelayMs(error, 10, { baseMs: 250, maxMs: 10_000, jitter: () => 0 }), 10_000);
});

test('invalid phone cannot become a canonical identifier', () => {
  assert.equal(normalizePhone('123').normalized, null);
});
