'use strict';

const fixture = require('../fixtures/marketplace-fixtures.json');
const { runPipeline } = require('./pipeline');

const result = runPipeline(fixture);
console.log(result.report);
console.log(`\nListings: ${result.listings.length}; canonical SKU: ${result.metrics.skuMetrics.length}; alerts: ${result.alerts.length}`);
