# Data contract

Contract version: `2026-09-03.1`. Business timezone: `Europe/Moscow`. Currency: `RUB`.

## Metric definitions

| Metric | Definition | Important limitation |
|---|---|---|
| Orders | Marketplace order units assigned to the business date | Not equal to completed sales |
| Sales | Completed/recognized sale units in the operational feed | Can change after late returns |
| Returns | Return units recognized in the same operational model | Marketplace status mapping is adapter-specific |
| Operational revenue | Sale amount after seller discounts, before marketplace commission and logistics | Not accounting revenue or net profit |
| Average check | Operational revenue / sales count | Zero when no sales exist |
| Stock | Current available units from the latest complete inventory snapshot | Warehouse detail is preserved by a live adapter |
| Days of stock | Current stock / average daily sales over 7 days | `null` when the sales rate is zero |
| Ad cost share | Ad spend / operational revenue × 100 | Attribution windows differ by marketplace |

Financial realization reports must be stored separately from operational orders. They may arrive later and must never silently replace intraday figures.

## Product identity

`canonicalSku` is the seller-controlled internal key. Every marketplace listing maps to it through `accountId + marketplaceProductId`. A name change never changes identity. Automatic mapping by seller article starts as unverified; manual corrections take precedence and are audited.

Wildberries adapter must preserve at least `nmID` and seller article. Ozon adapter must preserve at least `product_id` and `offer_id`. Live endpoint field names are versioned inside each adapter, not leaked into the canonical model.

## Import completeness

An import is `complete` only if all expected pages were received and validation passed. `partial` data may be stored in raw/staging layers but cannot advance the watermark or publish reports. Every raw page has a content hash and page key for replay and deduplication.

## Alert contract

- `OUT_OF_STOCK`: stock equals zero.
- `LOW_STOCK`: days of stock is at or below 7.
- `NO_SALES`: no completed sales for at least 14 days.
- `LOW_REVIEW`: a newly seen review has rating at or below 3.
- `PARTIAL_IMPORT`, `STALE_DATA`, `SYNC_FAILED`: data-quality alerts.

Lifecycle: `new → acknowledged → resolved`, with explicit reopening. `dedupeKey` is stable per alert type, account and listing. Delivery state is tracked separately to prevent duplicate Telegram messages.

## Security boundaries

- Only seller-owned accounts and read-only scopes are used initially.
- Tokens live only in n8n Credentials or the deployment secret store.
- Raw payloads must exclude unnecessary customer PII before persistence.
- Price, advertising and supply mutations require a separate workflow and human approval.
