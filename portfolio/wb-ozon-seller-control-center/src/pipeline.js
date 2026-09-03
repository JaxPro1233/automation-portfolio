'use strict';

const { normalizeFixture } = require('./normalize');
const { calculateMetrics } = require('./metrics');
const { generateAlerts } = require('./alerts');
const { buildDailyReport } = require('./report');

function runPipeline(fixture) {
  const normalized = normalizeFixture(fixture);
  const metrics = calculateMetrics(normalized.listings);
  const alerts = generateAlerts(normalized.listings, normalized.imports, undefined, fixture.evaluatedAt);
  const report = buildDailyReport({ businessDate: fixture.businessDate, metrics, alerts, imports: normalized.imports });
  return { contractVersion: '2026-09-03.1', businessDate: fixture.businessDate, ...normalized, metrics, alerts, report };
}

module.exports = { runPipeline };
