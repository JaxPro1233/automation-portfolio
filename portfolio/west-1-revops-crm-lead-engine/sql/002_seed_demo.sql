BEGIN;

INSERT INTO revops.sales_owners (
  id, display_name, active, territories, services, capacity,
  active_lead_count, notification_target, is_fallback
) VALUES
  ('owner-alex', 'Alex Rivera', true, ARRAY['US-WEST', 'US-EAST'], ARRAY['crm_automation', 'revops_audit'], 5, 0, '#sales-west', false),
  ('owner-sam', 'Sam Taylor', true, ARRAY['US-WEST', 'UK'], ARRAY['crm_automation'], 5, 0, '#sales-west', false),
  ('owner-fallback', 'Sales Operations Queue', true, ARRAY['*'], ARRAY['*'], 1000, 0, '#sales-operations', true)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  active = EXCLUDED.active,
  territories = EXCLUDED.territories,
  services = EXCLUDED.services,
  capacity = EXCLUDED.capacity,
  notification_target = EXCLUDED.notification_target,
  is_fallback = EXCLUDED.is_fallback,
  updated_at = now();

COMMIT;
