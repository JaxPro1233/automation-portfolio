'use strict';

const DEFAULT_RULES = { lowStockDays: 7, noSalesDays: 14, lowReviewRating: 3 };

function makeAlert(item, type, severity, message) {
  return {
    dedupeKey: `${type}:${item.tenantId}:${item.marketplace}:${item.marketplaceProductId}`,
    type,
    severity,
    lifecycle: 'new',
    canonicalSku: item.canonicalSku,
    marketplace: item.marketplace,
    marketplaceProductId: item.marketplaceProductId,
    message,
    dataAsOf: item.dataAsOf,
  };
}

function freshnessStatus(dataAsOf, evaluatedAt) {
  const ageHours = (Date.parse(evaluatedAt) - Date.parse(dataAsOf)) / 3600000;
  if (!Number.isFinite(ageHours) || ageHours < 0) return 'invalid';
  if (ageHours >= 24) return 'stale';
  if (ageHours >= 4) return 'delayed';
  return 'fresh';
}

function generateAlerts(listings, imports, rules = DEFAULT_RULES, evaluatedAt = new Date().toISOString()) {
  const alerts = [];
  for (const item of listings) {
    const days = item.avgDailySales7d > 0 ? item.stockTotal / item.avgDailySales7d : null;
    if (item.stockTotal === 0) {
      alerts.push(makeAlert(item, 'OUT_OF_STOCK', 'critical', `${item.canonicalSku}: товар закончился на ${item.marketplace}`));
    } else if (days !== null && days <= rules.lowStockDays) {
      alerts.push(makeAlert(item, 'LOW_STOCK', 'high', `${item.canonicalSku}: остатка примерно на ${days.toFixed(1)} дн.`));
    }
    if (item.noSalesDays >= rules.noSalesDays) {
      alerts.push(makeAlert(item, 'NO_SALES', 'medium', `${item.canonicalSku}: нет продаж ${item.noSalesDays} дн.`));
    }
    if (item.newReviews > 0 && item.lowestNewReviewRating !== null && item.lowestNewReviewRating <= rules.lowReviewRating) {
      alerts.push(makeAlert(item, 'LOW_REVIEW', 'high', `${item.canonicalSku}: новый отзыв ${item.lowestNewReviewRating}★`));
    }
  }

  for (const item of imports) {
    if (item.status !== 'complete' || item.receivedPages !== item.expectedPages) {
      alerts.push({
        dedupeKey: `PARTIAL_IMPORT:demo-seller:${item.source}`,
        type: 'PARTIAL_IMPORT', severity: 'critical', lifecycle: 'new', marketplace: item.source,
        message: `${item.source}: импорт неполный (${item.receivedPages}/${item.expectedPages} страниц)`,
        dataAsOf: item.dataAsOf,
      });
    }
    const freshness = freshnessStatus(item.dataAsOf, evaluatedAt);
    if (freshness === 'stale' || freshness === 'invalid') {
      alerts.push({
        dedupeKey: `STALE_DATA:demo-seller:${item.source}`,
        type: 'STALE_DATA', severity: 'critical', lifecycle: 'new', marketplace: item.source,
        message: `${item.source}: данные не обновлялись более 24 часов`, dataAsOf: item.dataAsOf,
      });
    }
  }
  return [...new Map(alerts.map((item) => [item.dedupeKey, item])).values()];
}

function transitionAlert(alert, action) {
  const transitions = {
    new: { acknowledge: 'acknowledged', resolve: 'resolved' },
    acknowledged: { resolve: 'resolved', reopen: 'new' },
    resolved: { reopen: 'new' },
  };
  const next = transitions[alert.lifecycle]?.[action];
  if (!next) throw new Error(`ALERT_TRANSITION: cannot ${action} from ${alert.lifecycle}`);
  return { ...alert, lifecycle: next };
}

module.exports = { DEFAULT_RULES, freshnessStatus, generateAlerts, transitionAlert };
