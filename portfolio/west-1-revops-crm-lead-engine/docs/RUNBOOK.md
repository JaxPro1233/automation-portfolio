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

## Production deployment checklist

1. Apply the supplied PostgreSQL migrations to a dedicated database and assign its n8n credential to all `PostgreSQL · ...` nodes.
2. Assign a least-privilege HubSpot private-app credential and create the unique deal property `revops_event_key`.
3. Assign a Slack bot credential and resolve `sales-leads` and `revops-alerts` to target channel IDs.
4. Assign the Meta Graph credential and configure the Meta webhook subscription for the production URL.
5. Assign a dedicated Header Auth credential to replay and manager-action webhooks.
6. Replace the automatically selected `KAFE PostgreSQL` and `Header Auth account` references; they are unrelated placeholders and must never be used for WEST 1.
7. Run the integration acceptance matrix against test workspaces, including duplicate delivery, 429/503 retries, failure queue, replay and SLA cancellation.
8. Publish only after the credential and destination review succeeds.

## n8n production asset

- Workflow: `Portfolio — Revenue Operations Lead Engine · Production Ready`
- Workflow ID: `qAzCRkAEP3w7WdN8`
- URL: `https://n8n-production-9bac.up.railway.app/workflow/qAzCRkAEP3w7WdN8`
- Data Table: `Portfolio RevOps Lead Events`
- Data Table ID: `kk0YJ2G8ISulRlCu`
- Failure Queue: `Portfolio RevOps Failure Queue`
- Failure Queue ID: `Nycdvcip0NBtoGqe`
- Current state: unpublished; manual DEMO verified; no external messages sent

The 50-element workflow contains a complete LIVE branch for Meta enrichment, transactional PostgreSQL persistence, HubSpot contact/deal deduplication, Slack delivery, SLA enforcement, bounded retries, error capture, authenticated replay and manager-action cancellation. Its manual trigger follows an isolated credential-free DEMO branch. The repository JSON is the sanitized export verified after creation.

## Recovery

- Temporary external failure: allow bounded retry to finish.
- Permanent 4xx: fix mapping or permissions, then replay the failed event.
- Identity conflict: resolve manually; never merge only because the workflow guessed.
- Owner unavailable: deactivate the owner and reassign through the fallback queue.
- n8n restart: process persisted inbox rows and due SLA checkpoints; never rely on memory.

## Deployment-specific configuration

- The executable demo uses an in-memory store and mock external adapters.
- LIVE nodes require the target organization's credentials, HubSpot property IDs, Slack channel IDs and Meta app/page configuration.
- Full business-calendar SLA calculation is outside MVP.
- The demo AI adapter is deterministic; a live LLM is optional and explanation-only.
