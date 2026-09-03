BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS marketplace;

CREATE TABLE IF NOT EXISTS marketplace.tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace.accounts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES marketplace.tenants(id),
  marketplace text NOT NULL CHECK (marketplace IN ('wildberries', 'ozon')),
  display_name text NOT NULL,
  is_demo boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, marketplace, display_name)
);

CREATE TABLE IF NOT EXISTS marketplace.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES marketplace.tenants(id),
  account_id text NOT NULL REFERENCES marketplace.accounts(id),
  dataset text NOT NULL,
  business_date date,
  status text NOT NULL CHECK (status IN ('received', 'running', 'partial', 'complete', 'failed')),
  expected_pages integer CHECK (expected_pages IS NULL OR expected_pages >= 0),
  received_pages integer NOT NULL DEFAULT 0 CHECK (received_pages >= 0),
  records_received integer NOT NULL DEFAULT 0 CHECK (records_received >= 0),
  records_upserted integer NOT NULL DEFAULT 0 CHECK (records_upserted >= 0),
  duplicates_skipped integer NOT NULL DEFAULT 0 CHECK (duplicates_skipped >= 0),
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (expected_pages IS NULL OR received_pages <= expected_pages),
  CHECK (status <> 'complete' OR expected_pages IS NULL OR received_pages = expected_pages)
);

CREATE INDEX IF NOT EXISTS import_runs_lookup_idx
  ON marketplace.import_runs (account_id, dataset, started_at DESC);

CREATE TABLE IF NOT EXISTS marketplace.sync_watermarks (
  account_id text NOT NULL REFERENCES marketplace.accounts(id),
  dataset text NOT NULL,
  cursor_value text,
  last_complete_from timestamptz,
  last_complete_to timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, dataset)
);

CREATE TABLE IF NOT EXISTS marketplace.raw_api_payloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL REFERENCES marketplace.import_runs(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES marketplace.accounts(id),
  dataset text NOT NULL,
  page_key text NOT NULL,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, dataset, page_key, payload_hash)
);

CREATE TABLE IF NOT EXISTS marketplace.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES marketplace.tenants(id),
  canonical_sku text NOT NULL,
  product_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, canonical_sku)
);

CREATE TABLE IF NOT EXISTS marketplace.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES marketplace.products(id),
  account_id text NOT NULL REFERENCES marketplace.accounts(id),
  marketplace_product_id text NOT NULL,
  marketplace_sku text NOT NULL,
  seller_article text NOT NULL,
  marketplace_name text NOT NULL,
  mapping_source text NOT NULL DEFAULT 'seller_article' CHECK (mapping_source IN ('seller_article', 'manual', 'import')),
  mapping_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, marketplace_product_id)
);

CREATE TABLE IF NOT EXISTS marketplace.daily_sales (
  listing_id uuid NOT NULL REFERENCES marketplace.listings(id),
  business_date date NOT NULL,
  orders_count integer NOT NULL CHECK (orders_count >= 0),
  sales_count integer NOT NULL CHECK (sales_count >= 0),
  returns_count integer NOT NULL CHECK (returns_count >= 0),
  operational_revenue numeric(16,2) NOT NULL CHECK (operational_revenue >= 0),
  currency char(3) NOT NULL DEFAULT 'RUB',
  source_run_id uuid NOT NULL REFERENCES marketplace.import_runs(id),
  data_as_of timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, business_date)
);

CREATE TABLE IF NOT EXISTS marketplace.inventory_snapshots (
  listing_id uuid NOT NULL REFERENCES marketplace.listings(id),
  captured_at timestamptz NOT NULL,
  stock_total numeric(16,3) NOT NULL CHECK (stock_total >= 0),
  avg_daily_sales_7d numeric(16,3) NOT NULL CHECK (avg_daily_sales_7d >= 0),
  days_of_stock numeric(16,2),
  no_sales_days integer NOT NULL DEFAULT 0 CHECK (no_sales_days >= 0),
  source_run_id uuid NOT NULL REFERENCES marketplace.import_runs(id),
  PRIMARY KEY (listing_id, captured_at)
);

CREATE TABLE IF NOT EXISTS marketplace.review_events (
  account_id text NOT NULL REFERENCES marketplace.accounts(id),
  marketplace_review_id text NOT NULL,
  listing_id uuid REFERENCES marketplace.listings(id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  occurred_at timestamptz NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  source_run_id uuid NOT NULL REFERENCES marketplace.import_runs(id),
  PRIMARY KEY (account_id, marketplace_review_id)
);

CREATE TABLE IF NOT EXISTS marketplace.ad_metrics (
  listing_id uuid NOT NULL REFERENCES marketplace.listings(id),
  business_date date NOT NULL,
  spend numeric(16,2) NOT NULL CHECK (spend >= 0),
  impressions bigint CHECK (impressions IS NULL OR impressions >= 0),
  clicks bigint CHECK (clicks IS NULL OR clicks >= 0),
  attributed_orders integer CHECK (attributed_orders IS NULL OR attributed_orders >= 0),
  source_run_id uuid NOT NULL REFERENCES marketplace.import_runs(id),
  data_as_of timestamptz NOT NULL,
  PRIMARY KEY (listing_id, business_date)
);

CREATE TABLE IF NOT EXISTS marketplace.supply_statuses (
  account_id text NOT NULL REFERENCES marketplace.accounts(id),
  marketplace_supply_id text NOT NULL,
  status_normalized text NOT NULL,
  status_raw text NOT NULL,
  expected_at timestamptz,
  updated_at timestamptz NOT NULL,
  source_run_id uuid NOT NULL REFERENCES marketplace.import_runs(id),
  PRIMARY KEY (account_id, marketplace_supply_id)
);

CREATE TABLE IF NOT EXISTS marketplace.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES marketplace.tenants(id),
  listing_id uuid REFERENCES marketplace.listings(id),
  dedupe_key text NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('OUT_OF_STOCK', 'LOW_STOCK', 'NO_SALES', 'LOW_REVIEW', 'PARTIAL_IMPORT', 'STALE_DATA', 'SYNC_FAILED')),
  severity text NOT NULL CHECK (severity IN ('info', 'medium', 'high', 'critical')),
  lifecycle text NOT NULL CHECK (lifecycle IN ('new', 'acknowledged', 'resolved')),
  message text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  UNIQUE (tenant_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS marketplace.alert_deliveries (
  alert_id uuid NOT NULL REFERENCES marketplace.alerts(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('telegram', 'dashboard')),
  recipient_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('claimed', 'sending', 'sent', 'failed', 'ambiguous')),
  attempt_count integer NOT NULL DEFAULT 0,
  external_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, channel, recipient_key)
);

CREATE TABLE IF NOT EXISTS marketplace.task_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES marketplace.tenants(id),
  task_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  rows_read integer NOT NULL DEFAULT 0,
  rows_written integer NOT NULL DEFAULT 0,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE OR REPLACE VIEW marketplace.mrt_daily_marketplace AS
SELECT
  a.tenant_id,
  a.marketplace,
  d.business_date,
  sum(d.operational_revenue) AS operational_revenue,
  sum(d.orders_count)::integer AS orders_count,
  sum(d.sales_count)::integer AS sales_count,
  sum(d.returns_count)::integer AS returns_count,
  CASE WHEN sum(d.sales_count) = 0 THEN 0
       ELSE round(sum(d.operational_revenue) / sum(d.sales_count), 2)
  END AS average_check,
  max(d.data_as_of) AS data_as_of
FROM marketplace.daily_sales d
JOIN marketplace.listings l ON l.id = d.listing_id
JOIN marketplace.accounts a ON a.id = l.account_id
GROUP BY a.tenant_id, a.marketplace, d.business_date;

COMMENT ON COLUMN marketplace.daily_sales.operational_revenue IS
  'Operational sales amount after seller discounts and before marketplace commission/logistics. Not accounting P&L.';

COMMIT;
