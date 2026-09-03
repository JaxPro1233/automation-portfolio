# Architecture

```text
WB adapter ─┐
            ├─ raw payloads ─ validation ─ staging ─ canonical model ─ marts
Ozon adapter┘                                      │                 │
                                                   ├─ alert engine ─ Telegram
                                                   └─ read API ───── dashboard
```

The implementation uses five boundaries:

1. Adapters own marketplace-specific endpoints, pagination and status mapping.
2. Raw storage makes imports replayable and auditable.
3. Staging rejects malformed or incomplete data before publication.
4. Canonical tables provide one product/SKU model for both marketplaces.
5. Marts expose stable metrics to Telegram and the dashboard.

The PostgreSQL schema is `marketplace`; it has no dependency on the existing `cafe` schema or WB review workflows. The portfolio demo uses fixtures and contains no seller credentials.

## Synchronization policy

- Catalog and mappings: daily plus manual refresh.
- Inventory and operational orders: incremental polling appropriate to documented marketplace limits.
- Reviews and questions: incremental polling with stable external IDs.
- Advertising and financial realization: separate jobs because availability and attribution lag differ.
- Backfill: bounded date ranges, separate task run, no automatic watermark advancement until complete.

HTTP 408, 429 and 5xx use bounded exponential backoff and `Retry-After` when present. Other 4xx responses fail immediately. Five exhausted attempts create a `SYNC_FAILED` alert.
