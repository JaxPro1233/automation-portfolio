# Runbook

## Local demo

Requirements: Node.js 20 or newer. No package installation and no credentials are required.

```bash
npm test
npm run check
npm run demo
npm run serve:demo
```

Open `http://127.0.0.1:8080` for the interactive portfolio dashboard. The server binds only to localhost, limits JSON request bodies and exposes no raw/contact data through its state endpoint.

## PostgreSQL preparation

Apply migrations in order to a dedicated database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/001_init.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/002_seed_demo.sql
```

Do not paste `DATABASE_URL` into logs, workflow exports or screenshots.

## Integration mode checklist

1. Create least-privilege HubSpot test credentials outside Git.
2. Create required custom contact/deal properties and record their internal names.
3. Configure a dedicated Slack test channel and secret Incoming Webhook URL.
4. Configure Meta webhook verification and a versioned Graph API adapter only in a test app.
5. Replace mock adapters without changing scoring/routing logic.
6. Verify one event end to end, then verify duplicate delivery and 429 handling.
7. Keep n8n unpublished until all credentials, URLs and scopes are reviewed.

## n8n demo assets

- Workflow: `Portfolio — Revenue Operations Lead Engine`
- Workflow ID: `E7dTlwe3l5Ws6Keh`
- Data Table: `Portfolio RevOps Lead Events`
- Data Table ID: `kk0YJ2G8ISulRlCu`
- Current state: unpublished, no assigned credentials, no external messages

The workflow includes a manual synthetic trigger, website and Meta-compatible webhook branches, idempotent Data Table upsert, CRM/Slack previews and a scheduled SLA preview worker. The repository JSON is the sanitized export verified after creation.

## Recovery

- Temporary external failure: allow bounded retry to finish.
- Permanent 4xx: fix mapping or permissions, then replay the failed event.
- Identity conflict: resolve manually; never merge only because the workflow guessed.
- Owner unavailable: deactivate the owner and reassign through the fallback queue.
- n8n restart: process persisted inbox rows and due SLA checkpoints; never rely on memory.

## Known limitations

- The executable demo uses an in-memory store and mock external adapters.
- Live PostgreSQL, HubSpot, Slack and Meta calls require test credentials and deployment configuration.
- Full business-calendar SLA calculation is outside MVP.
- The demo AI adapter is deterministic; a live LLM is optional and explanation-only.
