'use strict';

const rub = (value) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ₽`;
const num = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);

fetch('data.json').then((response) => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then((data) => {
  const t = data.metrics.totals;
  const cards = [
    ['Выручка', rub(t.salesRevenue)], ['Продажи', num(t.salesCount)], ['Средний чек', rub(t.averageCheck)],
    ['Возвраты', `${num(t.returnsCount)} · ${t.returnRate}%`], ['Остатки', `${num(t.stockTotal)} шт.`], ['Реклама', `${rub(t.adSpend)} · ${t.adCostShare}%`],
  ];
  document.querySelector('#kpis').innerHTML = cards.map(([label, value]) => `<article class="kpi"><small>${label}</small><strong>${value}</strong></article>`).join('');
  document.querySelector('#freshness').textContent = `Бизнес-дата ${data.businessDate} · WB ${data.imports[0].dataAsOf} · Ozon ${data.imports[1].dataAsOf}`;

  const maxRevenue = Math.max(...Object.values(data.metrics.byMarketplace).map((item) => item.salesRevenue));
  document.querySelector('#marketplaces').innerHTML = Object.entries(data.metrics.byMarketplace).map(([name, item]) => `
    <div class="market-row"><b>${name === 'wildberries' ? 'Wildberries' : 'Ozon'}</b><div class="bar"><i style="width:${item.salesRevenue / maxRevenue * 100}%"></i></div><strong>${rub(item.salesRevenue)}</strong></div>`).join('');

  document.querySelector('#alert-count').textContent = `${data.alerts.length} активных`;
  document.querySelector('#alerts').innerHTML = data.alerts.slice(0, 6).map((item) => `<div class="alert ${item.severity}"><b>${item.severity.toUpperCase()} · ${item.type}</b><span>${item.message}</span></div>`).join('');

  document.querySelector('#sku-table').innerHTML = data.metrics.skuMetrics.map((item) => `<tr><td>${item.canonicalSku}</td><td>${item.productName}</td><td>${item.salesCount}</td><td>${rub(item.salesRevenue)}</td><td>${item.stockTotal}</td><td>${item.daysOfStock ?? 'нет скорости'}</td><td>${item.adCostShare === null ? '—' : `${item.adCostShare}%`}</td></tr>`).join('');
}).catch((error) => {
  document.querySelector('#freshness').textContent = `Не удалось загрузить demo data: ${error.message}`;
});
