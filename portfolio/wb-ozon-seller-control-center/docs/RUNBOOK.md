# Runbook

## Demo mode

Requires Node.js 20+. No install step or credentials are required.

```bash
npm test
npm run demo
npm run build:dashboard
python3 -m http.server 8080 -d dashboard
```

Open `http://localhost:8080`.

## Before live API access

1. Confirm current official WB/Ozon endpoints and response schemas in seller documentation.
2. Create separate read-only credentials for catalog, orders/sales, inventory, reviews and advertising where supported.
3. Verify scopes with one read-only request per adapter; never reuse unrelated credentials.
4. Create a dedicated PostgreSQL role limited to the `marketplace` schema.
5. Apply `sql/001_init.sql` in staging and validate constraints.
6. Backfill a small date range and compare totals with seller cabinets.
7. Configure Telegram with a dedicated portfolio/test chat.
8. Activate jobs one at a time only after their reconciliation checks pass.

## Incident response

- `429`: honor `Retry-After`; do not increase polling frequency.
- Partial pagination: retain raw pages, mark import `partial`, do not move watermark.
- Schema drift: quarantine payload, record unknown fields/statuses, update only the affected adapter.
- Ambiguous Telegram send: mark delivery `ambiguous`; reconcile before retry.
- Wrong SKU mapping: disable the mapping, correct manually and rebuild affected marts from raw data.
