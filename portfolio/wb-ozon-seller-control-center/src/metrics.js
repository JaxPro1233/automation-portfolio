'use strict';

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function calculateMetrics(listings) {
  const totals = listings.reduce((acc, item) => {
    acc.ordersCount += item.ordersCount;
    acc.salesCount += item.salesCount;
    acc.returnsCount += item.returnsCount;
    acc.salesRevenue += item.salesRevenue;
    acc.stockTotal += item.stockTotal;
    acc.adSpend += item.adSpend;
    acc.newReviews += item.newReviews;
    return acc;
  }, { ordersCount: 0, salesCount: 0, returnsCount: 0, salesRevenue: 0, stockTotal: 0, adSpend: 0, newReviews: 0 });

  totals.averageCheck = totals.salesCount ? round(totals.salesRevenue / totals.salesCount) : 0;
  totals.returnRate = totals.salesCount ? round(totals.returnsCount / totals.salesCount * 100) : 0;
  totals.adCostShare = totals.salesRevenue ? round(totals.adSpend / totals.salesRevenue * 100) : 0;

  const bySku = new Map();
  for (const item of listings) {
    const metric = bySku.get(item.canonicalSku) || {
      canonicalSku: item.canonicalSku,
      productName: item.productName,
      marketplaces: [], ordersCount: 0, salesCount: 0, returnsCount: 0,
      salesRevenue: 0, stockTotal: 0, avgDailySales7d: 0, adSpend: 0,
    };
    metric.marketplaces.push(item.marketplace);
    metric.ordersCount += item.ordersCount;
    metric.salesCount += item.salesCount;
    metric.returnsCount += item.returnsCount;
    metric.salesRevenue += item.salesRevenue;
    metric.stockTotal += item.stockTotal;
    metric.avgDailySales7d += item.avgDailySales7d;
    metric.adSpend += item.adSpend;
    bySku.set(item.canonicalSku, metric);
  }

  const skuMetrics = [...bySku.values()].map((item) => ({
    ...item,
    averageCheck: item.salesCount ? round(item.salesRevenue / item.salesCount) : 0,
    daysOfStock: item.avgDailySales7d > 0 ? round(item.stockTotal / item.avgDailySales7d, 1) : null,
    adCostShare: item.salesRevenue ? round(item.adSpend / item.salesRevenue * 100) : null,
  })).sort((a, b) => b.salesRevenue - a.salesRevenue);

  const byMarketplace = Object.fromEntries(['wildberries', 'ozon'].map((source) => {
    const rows = listings.filter((item) => item.marketplace === source);
    return [source, calculateTotalsOnly(rows)];
  }));

  return { totals, byMarketplace, skuMetrics };
}

function calculateTotalsOnly(rows) {
  const result = rows.reduce((acc, item) => {
    acc.salesRevenue += item.salesRevenue;
    acc.salesCount += item.salesCount;
    acc.stockTotal += item.stockTotal;
    acc.adSpend += item.adSpend;
    return acc;
  }, { salesRevenue: 0, salesCount: 0, stockTotal: 0, adSpend: 0 });
  return { ...result, averageCheck: result.salesCount ? round(result.salesRevenue / result.salesCount) : 0 };
}

module.exports = { calculateMetrics, round };
