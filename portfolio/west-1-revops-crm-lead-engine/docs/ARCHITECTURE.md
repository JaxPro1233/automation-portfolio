# Architecture

```text
Website form ──────┐
                   ├─ n8n webhook ─ persistent inbox ─ normalization/validation
Meta Lead Ads ─────┘          │                          │
                              │                          ├─ identity resolution
                              │                          ├─ deterministic scoring
                              │                          └─ transactional routing
                              │                                      │
                              └─ audit / failed queue     CRM adapter ─ Slack adapter
                                                                     │
                                                  scheduled SLA worker
```

## Boundaries

1. Source adapters map website and Meta payloads to one canonical event.
2. PostgreSQL stores the raw event before processing and owns idempotency, state and SLA.
3. Deterministic code owns validation, scoring and routing. AI may explain a score but cannot change it.
4. CRM and notification adapters isolate external API behavior from business rules.
5. A scheduled worker claims due SLA checkpoints; long Wait-node executions are avoided.

## Reliability decisions

- `source + source_event_id` is the inbound idempotency key.
- Contact identity uses exact normalized email/phone. Conflicting matches require manual review.
- Outbound actions and SLA checkpoints have independent unique idempotency keys.
- HTTP 408, 429 and 5xx use bounded retry; other 4xx fail immediately.
- `Retry-After` takes priority over exponential backoff with jitter.
- Round-robin state is persisted and must be locked transactionally in a live PostgreSQL adapter.
- The mock adapters preserve the same contracts but never write to external systems.

## HubSpot integration note

The live adapter must use a custom unique contact property for safe partial upsert where possible. HubSpot supports email lookup and batch upsert, but its official documentation states that partial contact upserts are not supported when `email` is the `idProperty`. Contact and deal association is a separate explicit API operation.

## Meta integration note

A real Meta Lead Ads webhook does not normally include the complete lead form response. It provides a `leadgen_id`; the adapter must use that ID to retrieve `field_data` from the versioned Graph API. The public demo uses a sanitized enriched fixture and never claims to call Meta production APIs.
