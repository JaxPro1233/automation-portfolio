BEGIN;

CREATE SCHEMA IF NOT EXISTS revops;

CREATE TABLE revops.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('website', 'meta')),
  source_event_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'lead.submitted',
  occurred_at timestamptz,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN (
    'RECEIVED', 'VALIDATED', 'QUALIFIED', 'ROUTED', 'SYNCED', 'NOTIFIED',
    'REJECTED', 'MANUAL_REVIEW', 'FAILED'
  )),
  raw_payload jsonb NOT NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_id uuid,
  deal_id uuid,
  UNIQUE (source, source_event_id)
);

CREATE TABLE revops.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  company text,
  email_original text,
  email_normalized text,
  email_hash text,
  phone_original text,
  phone_normalized text,
  phone_hash text,
  consent boolean NOT NULL DEFAULT false,
  crm_contact_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX contacts_email_normalized_uq
  ON revops.contacts (email_normalized) WHERE email_normalized IS NOT NULL;
CREATE UNIQUE INDEX contacts_phone_normalized_uq
  ON revops.contacts (phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX contacts_email_hash_idx ON revops.contacts (email_hash);
CREATE INDEX contacts_phone_hash_idx ON revops.contacts (phone_hash);

CREATE TABLE revops.contact_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES revops.contacts(id),
  event_id uuid NOT NULL REFERENCES revops.lead_events(id),
  source text NOT NULL,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text,
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, event_id)
);

CREATE TABLE revops.sales_owners (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  territories text[] NOT NULL DEFAULT '{}',
  services text[] NOT NULL DEFAULT '{}',
  capacity integer NOT NULL CHECK (capacity >= 0),
  active_lead_count integer NOT NULL DEFAULT 0 CHECK (active_lead_count >= 0),
  notification_target text NOT NULL,
  is_fallback boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_fallback_owner_uq
  ON revops.sales_owners (is_fallback) WHERE is_fallback;

CREATE TABLE revops.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES revops.contacts(id),
  service text NOT NULL,
  stage text NOT NULL CHECK (stage IN (
    'QUALIFIED', 'IN_PROGRESS', 'QUALIFIED_OPPORTUNITY', 'NURTURE',
    'DISQUALIFIED', 'SLA_BREACHED', 'CLOSED_WON', 'CLOSED_LOST'
  )),
  score smallint CHECK (score BETWEEN 0 AND 100),
  lead_class text CHECK (lead_class IN ('HOT', 'WARM', 'COLD')),
  score_rule_version text,
  owner_id text REFERENCES revops.sales_owners(id),
  summary text,
  summary_provider text,
  crm_deal_id text UNIQUE,
  crm_url text,
  last_crm_sync_at timestamptz,
  first_action_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE revops.lead_events
  ADD CONSTRAINT lead_events_contact_fk FOREIGN KEY (contact_id) REFERENCES revops.contacts(id),
  ADD CONSTRAINT lead_events_deal_fk FOREIGN KEY (deal_id) REFERENCES revops.deals(id);

CREATE INDEX deals_open_dedupe_idx ON revops.deals (contact_id, service, created_at DESC)
  WHERE stage NOT IN ('DISQUALIFIED', 'CLOSED_WON', 'CLOSED_LOST');
CREATE INDEX deals_owner_open_idx ON revops.deals (owner_id, stage);

CREATE TABLE revops.score_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES revops.deals(id),
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  lead_class text NOT NULL CHECK (lead_class IN ('HOT', 'WARM', 'COLD')),
  rule_version text NOT NULL,
  factors jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE revops.routing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES revops.deals(id),
  owner_id text NOT NULL REFERENCES revops.sales_owners(id),
  reason text NOT NULL,
  rule_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE revops.routing_cursors (
  routing_key text PRIMARY KEY,
  next_position integer NOT NULL DEFAULT 0 CHECK (next_position >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE revops.sla_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES revops.deals(id),
  checkpoint_type text NOT NULL CHECK (checkpoint_type IN ('REMINDER', 'ESCALATION')),
  due_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'DELIVERED', 'CANCELLED', 'FAILED')),
  schedule_version text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, checkpoint_type, schedule_version)
);

CREATE INDEX sla_due_idx ON revops.sla_checkpoints (due_at)
  WHERE status = 'PENDING';

CREATE TABLE revops.outbound_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  recipient text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('SCHEDULED', 'PREVIEWED', 'SENT', 'FAILED', 'CANCELLED')),
  due_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE revops.integration_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES revops.lead_events(id),
  adapter text NOT NULL,
  operation text NOT NULL,
  attempt smallint NOT NULL CHECK (attempt > 0),
  succeeded boolean NOT NULL,
  status_code integer,
  error_code text,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX integration_attempts_event_idx ON revops.integration_attempts (event_id, attempted_at);

CREATE TABLE revops.failed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES revops.lead_events(id),
  failed_step text NOT NULL,
  error_code text NOT NULL,
  status_code integer,
  attempts smallint NOT NULL,
  resolution_status text NOT NULL CHECK (resolution_status IN ('OPEN', 'RETRYING', 'RESOLVED', 'IGNORED')),
  next_action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, failed_step)
);

CREATE TABLE revops.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor text NOT NULL,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_entity_idx ON revops.audit_log (entity_type, entity_id, created_at);

COMMIT;
