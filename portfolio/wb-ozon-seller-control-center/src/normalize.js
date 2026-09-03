'use strict';

const MARKETPLACES = new Set(['wildberries', 'ozon']);

function fail(message) {
  throw new Error(`MARKETPLACE_CONTRACT: ${message}`);
}

function text(value, field) {
  const result = String(value ?? '').trim();
  if (!result) fail(`${field} is required`);
  return result;
}

function number(value, field, { min = 0, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < min) fail(`${field} must be a number >= ${min}`);
  return result;
}

function common(source, row, context) {
  if (!MARKETPLACES.has(source)) fail(`unsupported marketplace: ${source}`);
  return {
    tenantId: text(context.tenantId, 'tenantId'),
    accountId: `${context.tenantId}:${source}:demo`,
    marketplace: source,
    businessDate: text(context.businessDate, 'businessDate'),
    currency: 'RUB',
    dataAsOf: text(context.dataAsOf, 'dataAsOf'),
    productName: text(row.name, `${source}.name`),
  };
}

function normalizeWildberries(row, context) {
  return {
    ...common('wildberries', row, context),
    canonicalSku: text(row.supplierArticle, 'wildberries.supplierArticle'),
    marketplaceProductId: text(row.nmId, 'wildberries.nmId'),
    marketplaceSku: text(row.nmId, 'wildberries.nmId'),
    sellerArticle: text(row.supplierArticle, 'wildberries.supplierArticle'),
    ordersCount: number(row.ordersCount, 'wildberries.ordersCount'),
    salesCount: number(row.salesCount, 'wildberries.salesCount'),
    returnsCount: number(row.returnsCount, 'wildberries.returnsCount'),
    salesRevenue: number(row.salesRevenue, 'wildberries.salesRevenue'),
    stockTotal: number(row.stockTotal, 'wildberries.stockTotal'),
    avgDailySales7d: number(row.avgDailySales7d, 'wildberries.avgDailySales7d'),
    noSalesDays: number(row.noSalesDays, 'wildberries.noSalesDays'),
    rating: number(row.rating, 'wildberries.rating'),
    lowestNewReviewRating: number(row.lowestNewReviewRating, 'wildberries.lowestNewReviewRating', { nullable: true }),
    newReviews: number(row.newReviews, 'wildberries.newReviews'),
    adSpend: number(row.adSpend, 'wildberries.adSpend'),
    supplyStatus: text(row.supplyStatus, 'wildberries.supplyStatus'),
  };
}

function normalizeOzon(row, context) {
  return {
    ...common('ozon', row, context),
    canonicalSku: text(row.offer_id, 'ozon.offer_id'),
    marketplaceProductId: text(row.product_id, 'ozon.product_id'),
    marketplaceSku: text(row.product_id, 'ozon.product_id'),
    sellerArticle: text(row.offer_id, 'ozon.offer_id'),
    ordersCount: number(row.ordered_units, 'ozon.ordered_units'),
    salesCount: number(row.sold_units, 'ozon.sold_units'),
    returnsCount: number(row.returned_units, 'ozon.returned_units'),
    salesRevenue: number(row.sales_revenue, 'ozon.sales_revenue'),
    stockTotal: number(row.stock_total, 'ozon.stock_total'),
    avgDailySales7d: number(row.avg_daily_sales_7d, 'ozon.avg_daily_sales_7d'),
    noSalesDays: number(row.no_sales_days, 'ozon.no_sales_days'),
    rating: number(row.rating, 'ozon.rating'),
    lowestNewReviewRating: number(row.lowest_new_review_rating, 'ozon.lowest_new_review_rating', { nullable: true }),
    newReviews: number(row.new_reviews, 'ozon.new_reviews'),
    adSpend: number(row.ad_spend, 'ozon.ad_spend'),
    supplyStatus: text(row.supply_status, 'ozon.supply_status'),
  };
}

function normalizeFixture(fixture) {
  if (!fixture || typeof fixture !== 'object') fail('fixture must be an object');
  const importBySource = new Map((fixture.imports || []).map((item) => [item.source, item]));
  const base = { tenantId: fixture.tenant?.id, businessDate: fixture.businessDate };
  const wbImport = importBySource.get('wildberries');
  const ozonImport = importBySource.get('ozon');
  if (!wbImport || !ozonImport) fail('complete import metadata is required for both marketplaces');

  const listings = [
    ...(fixture.wildberries || []).map((row) => normalizeWildberries(row, { ...base, dataAsOf: wbImport.dataAsOf })),
    ...(fixture.ozon || []).map((row) => normalizeOzon(row, { ...base, dataAsOf: ozonImport.dataAsOf })),
  ];
  const keys = new Set();
  for (const item of listings) {
    const key = `${item.accountId}:${item.marketplaceProductId}:${item.businessDate}`;
    if (keys.has(key)) fail(`duplicate listing snapshot: ${key}`);
    keys.add(key);
  }
  return { listings, imports: fixture.imports, timezone: fixture.timezone };
}

module.exports = { normalizeFixture, normalizeWildberries, normalizeOzon };
