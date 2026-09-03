'use strict';

function money(value) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value).replace(/[\u00a0\u202f]/g, ' ')} ₽`;
}

function buildDailyReport({ businessDate, metrics, alerts, imports }) {
  if (imports.some((item) => item.status !== 'complete' || item.receivedPages !== item.expectedPages)) {
    throw new Error('REPORT_BLOCKED: source data is partial');
  }
  const critical = alerts.filter((item) => item.severity === 'critical').length;
  const high = alerts.filter((item) => item.severity === 'high').length;
  const top = metrics.skuMetrics.slice(0, 3).map((item, index) => `${index + 1}. ${item.canonicalSku} — ${money(item.salesRevenue)}`).join('\n');
  return `📊 WB + Ozon · ${businessDate}\n\n` +
    `Выручка: ${money(metrics.totals.salesRevenue)}\n` +
    `Продажи: ${metrics.totals.salesCount}\n` +
    `Возвраты: ${metrics.totals.returnsCount}\n` +
    `Средний чек: ${money(metrics.totals.averageCheck)}\n` +
    `Остатки: ${metrics.totals.stockTotal} шт.\n` +
    `Реклама: ${money(metrics.totals.adSpend)} (${metrics.totals.adCostShare}%)\n\n` +
    `🚨 Alerts: critical ${critical}, high ${high}\n\n` +
    `🏆 Топ SKU\n${top}\n\n` +
    `Данные: WB ${imports[0].dataAsOf}; Ozon ${imports[1].dataAsOf}`;
}

module.exports = { buildDailyReport, money };
