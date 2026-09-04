# Data contract

## Canonical website event

See [`fixtures/website-hot-lead.json`](../fixtures/website-hot-lead.json).

Required fields:

- `event_type = lead.submitted`;
- `source_event_id` unique within the source;
- valid `occurred_at`;
- at least one valid email or phone;
- explicit boolean `consent` for outbound follow-up.

## Meta adapter

The production webhook notification contains `leadgen_id`, `page_id`, `form_id`, `ad_id` and `created_time`. The adapter then retrieves the lead fields and emits the canonical contract. The fixture [`meta-enriched-lead.json`](../fixtures/meta-enriched-lead.json) represents that enriched response.

## Normalization

- Email: trim and lowercase. Plus-tag removal is domain-configured, never global.
- Phone: E.164 when country context is sufficient; inferred country code creates a warning.
- Empty strings become `null`.
- HTML tags and control characters are stripped from free text.
- Original and normalized values are retained separately.
- Logs use stable hashes or masked values instead of open email/phone.

## Identity conflict

If email resolves to contact A and phone resolves to contact B, the event becomes `MANUAL_REVIEW`. Automatic merge and external CRM writes are prohibited for that event.
