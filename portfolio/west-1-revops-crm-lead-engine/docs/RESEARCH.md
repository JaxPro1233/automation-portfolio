# Technical research

Research checked on 4 September 2026. Only primary vendor documentation is used for integration claims.

## n8n

- [Webhook node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) — inbound website and Meta-compatible endpoints.
- [Data tables](https://docs.n8n.io/data/data-tables/) — credential-free persistent demo inbox.
- [Schedule Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/) — periodic SLA checkpoint worker.
- [Error handling](https://docs.n8n.io/flow-logic/error-handling/) — production options include per-node behavior and an Error Trigger workflow.

The official n8n workflow guidance used during implementation requires raw form persistence, warns against long waits for durable state and recommends native nodes where possible. The workflow was built with the official Workflow SDK and validated before creation.

## HubSpot

- [CRM contacts guide](https://developers.hubspot.com/docs/guides/api/crm/objects/contacts) — create, read, update and upsert behavior.

Verified behavior:

- one contact can be read by email with `idProperty=email`;
- batch contact upsert uses `/crm/v3/objects/contacts/batch/upsert`;
- partial contact upsert is not supported when email is the `idProperty`;
- contact-to-record association is an explicit operation.

The live adapter should therefore prefer a custom unique external property and keep local idempotency/state in PostgreSQL.

## Meta Lead Ads

- [Retrieving leads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving) — lead webhook and Graph API retrieval flow.

Verified behavior: the webhook notification supplies `leadgen_id`, page/form/ad identifiers and creation time. The adapter then retrieves the lead record and its `field_data` through a versioned Graph API endpoint. The demo fixture represents the already-enriched result.

## Slack

- [Sending messages using Incoming Webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks) — JSON POST payloads and channel behavior.

Verified behavior: an Incoming Webhook URL is a secret bound to its configured app/channel, accepts JSON such as `{ "text": "..." }`, and cannot override the destination channel at send time. The portfolio workflow stores a preview instead of calling the URL.
