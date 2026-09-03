-- Reference SQL for n8n Postgres nodes. Values marked $N must be query parameters.

-- Claim an alert delivery exactly once.
INSERT INTO marketplace.alert_deliveries (alert_id, channel, recipient_key, status)
VALUES ($1::uuid, 'telegram', $2::text, 'claimed')
ON CONFLICT (alert_id, channel, recipient_key) DO NOTHING
RETURNING alert_id;

-- Advance a watermark only after a complete import.
INSERT INTO marketplace.sync_watermarks (
  account_id, dataset, cursor_value, last_complete_from, last_complete_to, last_success_at
)
SELECT account_id, dataset, $2::text, $3::timestamptz, $4::timestamptz, now()
FROM marketplace.import_runs
WHERE id = $1::uuid AND status = 'complete'
ON CONFLICT (account_id, dataset) DO UPDATE
SET cursor_value = EXCLUDED.cursor_value,
    last_complete_from = EXCLUDED.last_complete_from,
    last_complete_to = EXCLUDED.last_complete_to,
    last_success_at = EXCLUDED.last_success_at,
    updated_at = now()
RETURNING account_id, dataset;

-- Data freshness used by dashboard and Telegram footer.
SELECT
  account_id,
  dataset,
  last_success_at,
  CASE
    WHEN last_success_at IS NULL THEN 'missing'
    WHEN last_success_at < now() - interval '24 hours' THEN 'stale'
    WHEN last_success_at < now() - interval '4 hours' THEN 'delayed'
    ELSE 'fresh'
  END AS freshness
FROM marketplace.sync_watermarks;

-- Never publish a daily report unless every required dataset is complete.
SELECT bool_and(status = 'complete') AS report_ready
FROM marketplace.import_runs
WHERE tenant_id = $1::text
  AND business_date = $2::date
  AND dataset = ANY($3::text[]);
