import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

const start = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Run Demo Safely', parameters: {}, position: [-1100, 300] },
  output: [{}],
});

const fixtures = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Synthetic WB + Ozon',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const rows = [];
for (let i = 1; i <= 10; i++) {
  const sku = 'SKU-' + String(i).padStart(3, '0');
  for (const marketplace of ['wildberries', 'ozon']) {
    const factor = marketplace === 'wildberries' ? 1 : 0.85;
    const salesCount = i === 7 ? 0 : Math.max(1, Math.round((22 - i * 1.5) * factor));
    const stockTotal = (i === 3 && marketplace === 'wildberries') || (i === 8 && marketplace === 'ozon') ? 0 : Math.round((8 + i * 5) * factor);
    rows.push({ json: {
      tenantId: 'demo-seller', accountId: 'demo-seller:' + marketplace,
      marketplace, canonicalSku: sku, marketplaceProductId: (marketplace === 'wildberries' ? '91' : '82') + String(i).padStart(4, '0'),
      productName: 'Demo product ' + i, businessDate: '2026-09-02', currency: 'RUB',
      ordersCount: salesCount + 2, salesCount, returnsCount: i % 4 === 0 ? 1 : 0,
      salesRevenue: salesCount * (900 + i * 150), stockTotal,
      avgDailySales7d: i === 7 ? 0 : Math.max(0.5, salesCount / 5), noSalesDays: i === 7 ? 16 : 0,
      rating: 4.7, lowestNewReviewRating: i === 2 ? 2 : null, newReviews: i === 2 ? 1 : 0,
      adSpend: Math.round(salesCount * 130), dataAsOf: '2026-09-02T20:00:00+03:00'
    } });
  }
}
return rows;`,
    },
    position: [-820, 300],
  },
  output: [{ marketplace: 'wildberries', canonicalSku: 'SKU-001', salesRevenue: 21000 }],
});

const normalize = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize + Validate',
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const items = $input.all();
const seen = new Set();
for (const item of items) {
  const row = item.json;
  for (const field of ['tenantId','accountId','marketplace','canonicalSku','marketplaceProductId','businessDate','dataAsOf']) {
    if (row[field] === null || row[field] === undefined || row[field] === '') throw new Error('DATA_CONTRACT: missing ' + field);
  }
  const key = row.accountId + ':' + row.marketplaceProductId + ':' + row.businessDate;
  if (seen.has(key)) throw new Error('DATA_CONTRACT: duplicate ' + key);
  seen.add(key);
}
return items;`,
    },
    position: [-520, 300],
  },
  output: [{ marketplace: 'wildberries', canonicalSku: 'SKU-001', validated: true }],
});

const calculate = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Metrics + Alert Engine',
    parameters: {
      mode: 'runOnceForAllItems', language: 'javaScript',
      jsCode: `const listings = $input.all().map(i => i.json);
const totals = listings.reduce((a, r) => {
  a.orders += r.ordersCount; a.sales += r.salesCount; a.returns += r.returnsCount;
  a.revenue += r.salesRevenue; a.stock += r.stockTotal; a.adSpend += r.adSpend; return a;
}, { orders: 0, sales: 0, returns: 0, revenue: 0, stock: 0, adSpend: 0 });
totals.averageCheck = totals.sales ? Math.round(totals.revenue / totals.sales * 100) / 100 : 0;
const alerts = [];
for (const r of listings) {
  const days = r.avgDailySales7d > 0 ? r.stockTotal / r.avgDailySales7d : null;
  const push = (type, severity, message) => alerts.push({ dedupeKey: type + ':' + r.accountId + ':' + r.marketplaceProductId, type, severity, sku: r.canonicalSku, marketplace: r.marketplace, message });
  if (r.stockTotal === 0) push('OUT_OF_STOCK', 'critical', 'Товар закончился');
  else if (days !== null && days <= 7) push('LOW_STOCK', 'high', 'Остатка на ' + days.toFixed(1) + ' дн.');
  if (r.noSalesDays >= 14) push('NO_SALES', 'medium', 'Нет продаж ' + r.noSalesDays + ' дн.');
  if (r.newReviews && r.lowestNewReviewRating <= 3) push('LOW_REVIEW', 'high', 'Новый отзыв ' + r.lowestNewReviewRating + '★');
}
return [{ json: { contractVersion: '2026-09-03.1', importStatus: 'complete', listingCount: listings.length, canonicalSkuCount: new Set(listings.map(r => r.canonicalSku)).size, totals, alerts, listings } }];`,
    },
    position: [-200, 300],
  },
  output: [{ importStatus: 'complete', listingCount: 20, canonicalSkuCount: 10, totals: { revenue: 250000 }, alerts: [] }],
});

const report = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Daily Report',
    parameters: {
      mode: 'runOnceForEachItem', language: 'javaScript',
      jsCode: `if ($json.importStatus !== 'complete') throw new Error('REPORT_BLOCKED: partial data');
const money = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value).replace(/[\\u00a0\\u202f]/g, ' ') + ' ₽';
const critical = $json.alerts.filter(a => a.severity === 'critical').length;
const high = $json.alerts.filter(a => a.severity === 'high').length;
return { json: { ...$json, telegramPreview: '📊 WB + Ozon · DEMO\\n\\nВыручка: ' + money($json.totals.revenue) + '\\nПродажи: ' + $json.totals.sales + '\\nСредний чек: ' + money($json.totals.averageCheck) + '\\nОстатки: ' + $json.totals.stock + ' шт.\\n\\n🚨 Critical: ' + critical + ' · High: ' + high + '\\n\\nSynthetic data · no message was sent' } };`,
    },
    position: [120, 300],
  },
  output: [{ telegramPreview: '📊 WB + Ozon · DEMO', listingCount: 20, canonicalSkuCount: 10 }],
});

const preview = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Telegram Preview (No Send)',
    parameters: {
      mode: 'manual', includeOtherFields: true,
      assignments: { assignments: [{ id: 'delivery-mode', name: 'deliveryMode', value: 'preview_only', type: 'string' }, { id: 'message', name: 'message', value: expr('{{ $json.telegramPreview }}'), type: 'string' }] },
    },
    position: [450, 300],
  },
  output: [{ deliveryMode: 'preview_only', message: '📊 WB + Ozon · DEMO' }],
});

const sourceNote = sticky('## Safe data source\n20 synthetic marketplace listings. No API keys or customer data.', [fixtures], { color: 4 });
const controlNote = sticky('## Quality gates\nDuplicate checks, complete-import gate and stable alert dedupe keys.', [normalize, calculate], { color: 7 });
const outputNote = sticky('## Portfolio output\nTelegram message is generated as preview and is never sent.', [report, preview], { color: 5 });

export default workflow('marketplace-demo-pipeline', 'Marketplace — Safe Demo Pipeline')
  .add(start.to(fixtures).to(normalize).to(calculate).to(report).to(preview))
  .add(sourceNote)
  .add(controlNote)
  .add(outputNote);
