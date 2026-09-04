# Revenue Operations / CRM Lead Engine

## The problem

Inbound leads arrive from forms and paid campaigns, but manual CRM entry creates duplicate records, loses attribution and delays first response. A simple “form to CRM” workflow does not solve concurrent routing, API failure or missed-SLA recovery.

## The system

This deployment-ready system creates one reliable path from lead capture to sales action:

`capture → persist → normalize → resolve identity → score → route → CRM → notify → SLA control`

It accepts website and Meta-compatible lead events, preserves the raw input, prevents duplicate side effects, applies explainable scoring rules, routes only to eligible active owners and records an auditable outcome.

## Reliability by design

- Stable event and outbound idempotency keys.
- Explicit manual review when email and phone identify different people.
- Bounded retry with `Retry-After` support and a failed-event recovery queue.
- Transaction-ready round-robin state and capacity-aware fallback routing.
- Separate scheduled SLA checkpoints instead of fragile long-running waits.
- AI is explanation-only; deterministic rules own business decisions.

## Honest demo boundary

The public demo uses synthetic people, a mock CRM and Slack previews. The same n8n canvas contains the gated LIVE path for Meta Graph API, PostgreSQL, HubSpot and Slack, plus retries, SLA delivery, failure recovery and replay. It is kept unpublished until environment-specific credentials and identifiers are assigned.

## Result

The demo proves the same event can be delivered twice without creating two deals, a temporary CRM rate limit does not lose the lead, and an untouched HOT lead produces exactly one reminder and one escalation.
