'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('../fixtures/marketplace-fixtures.json');
const { runPipeline } = require('../src/pipeline');
const { normalizeFixture } = require('../src/normalize');
const { freshnessStatus, generateAlerts, transitionAlert } = require('../src/alerts');
const { retryDecision } = require('../src/retry-policy');

test('normalizes 20 marketplace listings into 10 canonical SKU', () => {
  const result = runPipeline(fixture);
  assert.equal(result.listings.length, 20);
  assert.equal(result.metrics.skuMetrics.length, 10);
  assert.equal(result.metrics.skuMetrics.every((item) => item.marketplaces.length === 2), true);
});

test('calculates deterministic operational totals', () => {
  const result = runPipeline(fixture);
  assert.equal(result.metrics.totals.salesRevenue, 259047);
  assert.equal(result.metrics.totals.salesCount, 153);
  assert.equal(result.metrics.totals.returnsCount, 9);
  assert.equal(result.metrics.totals.averageCheck, 1693.12);
  assert.equal(result.metrics.totals.stockTotal, 534);
  assert.match(result.report, /Выручка: 259 047 ₽/);
});

test('detects out-of-stock, low-stock, no-sales and low-review scenarios', () => {
  const result = runPipeline(fixture);
  const types = new Set(result.alerts.map((item) => item.type));
  for (const type of ['OUT_OF_STOCK', 'LOW_STOCK', 'NO_SALES', 'LOW_REVIEW']) assert.equal(types.has(type), true);
  assert.equal(new Set(result.alerts.map((item) => item.dedupeKey)).size, result.alerts.length);
});

test('blocks a report when any source import is partial', () => {
  const partial = structuredClone(fixture);
  partial.imports[1].status = 'partial';
  partial.imports[1].receivedPages = 1;
  const normalized = normalizeFixture(partial);
  const alerts = generateAlerts(normalized.listings, normalized.imports);
  assert.equal(alerts.some((item) => item.type === 'PARTIAL_IMPORT'), true);
  assert.throws(() => runPipeline(partial), /REPORT_BLOCKED/);
});

test('rejects duplicate source snapshots', () => {
  const duplicate = structuredClone(fixture);
  duplicate.wildberries.push(structuredClone(duplicate.wildberries[0]));
  assert.throws(() => normalizeFixture(duplicate), /duplicate listing snapshot/);
});

test('product rename does not change canonical SKU identity', () => {
  const renamed = structuredClone(fixture);
  renamed.wildberries[0].name = 'Термокружка Urban — новое название';
  const rows = normalizeFixture(renamed).listings.filter((item) => item.canonicalSku === 'SKU-001');
  assert.equal(rows.length, 2);
  assert.equal(rows.some((item) => item.productName.includes('новое название')), true);
});

test('classifies source freshness using deterministic timestamps', () => {
  assert.equal(freshnessStatus('2026-09-02T20:00:00+03:00', '2026-09-02T21:00:00+03:00'), 'fresh');
  assert.equal(freshnessStatus('2026-09-01T20:00:00+03:00', '2026-09-02T21:00:00+03:00'), 'stale');
});

test('alert lifecycle accepts only explicit transitions', () => {
  const alert = { lifecycle: 'new' };
  assert.equal(transitionAlert(alert, 'acknowledge').lifecycle, 'acknowledged');
  assert.throws(() => transitionAlert(alert, 'reopen'), /ALERT_TRANSITION/);
});

test('429 retry is bounded and respects Retry-After', () => {
  assert.deepEqual(retryDecision({ attempt: 1, statusCode: 429, retryAfterSeconds: 3 }), { retry: true, delayMs: 3000, reason: 'rate_limit' });
  assert.deepEqual(retryDecision({ attempt: 5, statusCode: 429 }), { retry: false, delayMs: 0, reason: 'attempt_limit' });
  assert.deepEqual(retryDecision({ attempt: 1, statusCode: 400 }), { retry: false, delayMs: 0, reason: 'not_retryable' });
});
