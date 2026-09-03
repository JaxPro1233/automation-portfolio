# Case study: WB + Ozon Seller Operations Control Center

## Business problem

A multi-marketplace seller has to reconcile different WB and Ozon identifiers, statuses and report schedules. Without one operating view, stockouts, listings with no sales and reputation problems are noticed late, while spreadsheet reporting consumes daily manual work.

## Proposed solution

The control center ingests each marketplace through an isolated adapter, retains replayable raw payloads, validates complete imports and maps source listings to canonical SKU. It then produces stable operational marts for revenue, sales, returns, average check, inventory, advertising and review health.

The alert engine prioritizes out-of-stock, low-stock, no-sales, low-rating and stale-source conditions. The same data powers a concise Telegram report and a read-only dashboard. Watermarks only advance after complete imports, and an idempotency key prevents duplicate notifications.

## Portfolio implementation

This repository contains a deterministic, credential-free implementation using 20 synthetic marketplace listings mapped to 10 canonical SKU. It includes:

- executable normalization, metric and alert logic;
- automated tests for mapping, import completeness, freshness and retry behavior;
- an isolated PostgreSQL schema with raw, canonical and mart layers;
- a static seller dashboard;
- an inactive n8n workflow that previews the report without sending messages;
- architecture, data-contract, acceptance and incident-response documentation.

## Demonstrated result

The fixture produces a reconciled daily snapshot and deliberately exposes critical stock, stalled-sales and review scenarios. All figures are synthetic demonstration data. They are not presented as a real client's revenue, savings or production outcome.

For a live deployment, the final step is controlled integration with current official WB/Ozon APIs, read-only seller credentials, a dedicated PostgreSQL role and a test Telegram chat, followed by cabinet-to-database reconciliation before activation.

## What this proves

- Marketplace-specific data can be separated from stable business logic.
- Product renames do not break reporting when identity is based on canonical mappings.
- Partial API pagination cannot silently publish incomplete reports.
- Operational alerts have explicit severity, lifecycle and delivery idempotency.
- The public demo is reproducible without exposing customer data or credentials.
