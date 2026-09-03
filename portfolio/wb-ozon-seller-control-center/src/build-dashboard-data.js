'use strict';

const fs = require('node:fs');
const path = require('node:path');
const fixture = require('../fixtures/marketplace-fixtures.json');
const { runPipeline } = require('./pipeline');

const result = runPipeline(fixture);
const target = path.join(__dirname, '..', 'dashboard', 'data.json');
fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Dashboard data written to ${target}`);
