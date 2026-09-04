import { workflow, node, trigger, sticky, ifElse, expr } from '@n8n/workflow-sdk';

const leadEventsTable = {
  __rl: true,
  mode: 'id',
  value: 'kk0YJ2G8ISulRlCu',
  cachedResultName: 'Portfolio RevOps Lead Events',
};

const manualDemo = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Run Safe Demo', position: [180, 120], parameters: {} },
  output: [{}],
});

const websiteWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST Website Lead',
    position: [180, 320],
    parameters: {
      httpMethod: 'POST',
      path: 'portfolio/revops-leads/website',
      authentication: 'none',
      responseMode: 'responseNode',
      options: { allowedOrigins: '*' },
    },
  },
  output: [{ body: { source_event_id: 'form_submission_1001' }, headers: {}, query: {}, params: {} }],
});

const metaWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST Meta Lead',
    position: [180, 500],
    parameters: {
      httpMethod: 'POST',
      path: 'portfolio/revops-leads/meta',
      authentication: 'none',
      responseMode: 'responseNode',
      options: { allowedOrigins: '*' },
    },
  },
  output: [{ body: { leadgen_id: 'meta-lead-2001', field_data: [] }, headers: {}, query: {}, params: {} }],
});

const loadSyntheticLead = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Load Synthetic Lead',
    position: [430, 120],
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `return {
  json: {
    _trigger_kind: 'manual',
    event_type: 'lead.submitted',
    occurred_at: '2026-09-04T09:30:00Z',
    source_event_id: 'form_submission_1001',
    lead: {
      first_name: 'Alex', last_name: 'Morgan',
      email: ' Alex.Morgan+demo@example.com ',
      phone: '+1 (415) 555-0184', company: 'Northwind Studio',
      territory: 'US-WEST', service: 'crm_automation',
      message: 'We need to respond to inbound leads faster and prevent duplicate CRM records.',
      consent: true
    },
    attribution: { utm_source: 'linkedin', utm_medium: 'paid_social', utm_campaign: 'revops_demo' }
  }
};`,
    },
  },
  output: [{
    _trigger_kind: 'manual', event_type: 'lead.submitted', occurred_at: '2026-09-04T09:30:00Z',
    source_event_id: 'form_submission_1001',
    lead: { first_name: 'Alex', last_name: 'Morgan', email: ' Alex.Morgan+demo@example.com ', phone: '+1 (415) 555-0184', company: 'Northwind Studio', territory: 'US-WEST', service: 'crm_automation', message: 'We need to respond to inbound leads faster and prevent duplicate CRM records.', consent: true },
    attribution: { utm_source: 'linkedin', utm_medium: 'paid_social', utm_campaign: 'revops_demo' },
  }],
});

const normalizeAndScore = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize Score and Route',
    position: [720, 320],
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const incoming = $json.body ?? $json;
const isMeta = Boolean(incoming.leadgen_id);
const fields = Array.isArray(incoming.field_data) ? incoming.field_data : [];
const field = (name) => fields.find((item) => item?.name === name)?.values?.[0] ?? null;
const rawLead = isMeta ? {
  first_name: field('first_name') ?? (field('full_name') ?? '').split(' ')[0],
  last_name: field('last_name') ?? (field('full_name') ?? '').split(' ').slice(1).join(' '),
  email: field('email'), phone: field('phone_number'), company: field('company_name'),
  territory: field('territory'), service: field('service'), message: field('message'),
  consent: field('consent') !== 'false'
} : (incoming.lead ?? incoming);
const clean = (value, limit = 2000) => value == null ? null : String(value)
  .replace(/[\\u0000-\\u001F\\u007F]/g, '').replace(/<[^>]*>/g, ' ')
  .replace(/\\s+/g, ' ').trim().slice(0, limit) || null;
const email = clean(rawLead.email, 320)?.toLowerCase() ?? null;
const digits = clean(rawLead.phone, 64)?.replace(/\\D/g, '') ?? '';
const phone = digits.length >= 7 && digits.length <= 15
  ? '+' + (String(rawLead.phone).trim().startsWith('+') ? digits : '1' + digits)
  : null;
const territory = clean(rawLead.territory, 50);
const service = clean(rawLead.service, 100);
let score = 0;
const factors = [];
const add = (code, points) => { score += points; factors.push({ code, points }); };
const publicDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
const domain = email?.split('@')[1];
if (domain && !publicDomains.includes(domain)) add('CORPORATE_EMAIL', 15);
if (clean(rawLead.company, 200)) add('COMPANY_PRESENT', 10);
if (service === 'crm_automation') add('TARGET_SERVICE', 25);
if (['US-WEST', 'US-EAST', 'UK'].includes(territory)) add('SERVED_TERRITORY', 15);
else if (territory) add('UNSERVED_TERRITORY', -30);
if ((clean(rawLead.message) ?? '').length >= 25) add('SPECIFIC_NEED', 15);
if (!isMeta) add('HIGH_INTENT_SOURCE', 10);
if (email && phone) add('TWO_CONTACT_METHODS', 10);
if (rawLead.consent !== true) add('NO_FOLLOWUP_CONSENT', -20);
score = Math.max(0, Math.min(100, score));
const leadClass = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';
const valid = Boolean((email || phone) && (incoming.source_event_id || incoming.leadgen_id) && (!isMeta || fields.length));
const now = new Date();
const reminderMs = leadClass === 'HOT' ? 600000 : leadClass === 'WARM' ? 1800000 : 14400000;
const escalationMs = leadClass === 'HOT' ? 1800000 : leadClass === 'WARM' ? 7200000 : 86400000;
const source = isMeta ? 'meta' : 'website';
const sourceEventId = String(incoming.leadgen_id ?? incoming.source_event_id ?? '');
const ownerId = ['US-WEST', 'US-EAST'].includes(territory) && service === 'crm_automation'
  ? 'owner-alex' : territory === 'UK' && service === 'crm_automation' ? 'owner-sam' : 'owner-fallback';
return { json: {
  event_key: source + ':' + sourceEventId,
  source, source_event_id: sourceEventId,
  status: valid ? 'NOTIFIED' : (isMeta && !fields.length ? 'AWAITING_META_ENRICHMENT' : 'REJECTED'),
  lead_class: leadClass, score, owner_id: ownerId,
  email_masked: email ? email[0] + '***@' + domain : 'not supplied',
  phone_masked: phone ? phone.slice(0, 3) + '***' + phone.slice(-2) : 'not supplied',
  raw_payload: JSON.stringify(incoming),
  accepted_at: now.toISOString(),
  reminder_due_at: new Date(now.getTime() + reminderMs).toISOString(),
  escalation_due_at: new Date(now.getTime() + escalationMs).toISOString(),
  reminder_status: 'PENDING', escalation_status: 'PENDING', first_action_at: null,
  _respond: incoming._trigger_kind !== 'manual',
  _valid: valid, factors,
  crm_preview_url: 'https://mock-crm.local/deals/' + encodeURIComponent(source + '-' + sourceEventId)
} };`,
    },
  },
  output: [{
    event_key: 'website:form_submission_1001', source: 'website', source_event_id: 'form_submission_1001',
    status: 'NOTIFIED', lead_class: 'HOT', score: 100, owner_id: 'owner-alex',
    email_masked: 'a***@example.com', phone_masked: '+14***84', raw_payload: '{}',
    accepted_at: '2026-09-04T09:30:00.000Z', reminder_due_at: '2026-09-04T09:40:00.000Z',
    escalation_due_at: '2026-09-04T10:00:00.000Z', reminder_status: 'PENDING', escalation_status: 'PENDING',
    first_action_at: null, _respond: false, _valid: true, factors: [],
    crm_preview_url: 'https://mock-crm.local/deals/website-form_submission_1001',
  }],
});

const persistLeadEvent = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Persist Idempotent Lead Event',
    position: [1030, 320],
    parameters: {
      resource: 'row', operation: 'upsert', dataTableId: leadEventsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'event_key', condition: 'eq', keyValue: expr('{{ $json.event_key }}') }] },
      columns: {
        mappingMode: 'defineBelow', matchingColumns: ['event_key'],
        value: {
          event_key: expr('{{ $json.event_key }}'), source: expr('{{ $json.source }}'),
          source_event_id: expr('{{ $json.source_event_id }}'), status: expr('{{ $json.status }}'),
          lead_class: expr('{{ $json.lead_class }}'), score: expr('{{ $json.score }}'),
          owner_id: expr('{{ $json.owner_id }}'), email_masked: expr('{{ $json.email_masked }}'),
          phone_masked: expr('{{ $json.phone_masked }}'), raw_payload: expr('{{ $json.raw_payload }}'),
          accepted_at: expr('{{ $json.accepted_at }}'), reminder_due_at: expr('{{ $json.reminder_due_at }}'),
          escalation_due_at: expr('{{ $json.escalation_due_at }}'), reminder_status: expr('{{ $json.reminder_status }}'),
          escalation_status: expr('{{ $json.escalation_status }}'), first_action_at: expr('{{ $json.first_action_at }}'),
        },
        schema: [],
      },
      options: {},
    },
  },
  output: [{ id: 1, createdAt: '2026-09-04T09:30:00.000Z', updatedAt: '2026-09-04T09:30:00.000Z' }],
});

const buildSafePreview = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build CRM and Slack Preview',
    position: [1320, 320],
    parameters: {
      mode: 'runOnceForEachItem', language: 'javaScript',
      jsCode: `const lead = $('Normalize Score and Route').item.json;
return { json: {
  accepted: true,
  event_key: lead.event_key,
  status: lead.status,
  score: lead.score,
  lead_class: lead.lead_class,
  owner_id: lead.owner_id,
  crm_preview_url: lead.crm_preview_url,
  notification_preview: 'New ' + lead.lead_class + ' lead (' + lead.score + '/100) · ' + lead.email_masked + ' · owner ' + lead.owner_id,
  duplicate_control: 'Data Table upsert on event_key',
  external_messages_sent: 0,
  _respond: lead._respond
} };`,
    },
  },
  output: [{ accepted: true, event_key: 'website:form_submission_1001', status: 'NOTIFIED', score: 100, lead_class: 'HOT', owner_id: 'owner-alex', crm_preview_url: 'https://mock-crm.local/deals/website-form_submission_1001', notification_preview: 'New HOT lead (100/100) · a***@example.com · owner owner-alex', duplicate_control: 'Data Table upsert on event_key', external_messages_sent: 0, _respond: false }],
});

const shouldRespond = ifElse({
  version: 2.3,
  config: {
    name: 'Webhook Request?',
    position: [1570, 320],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json._respond }}'), rightValue: true, operator: { type: 'boolean', operation: 'true' } }],
        combinator: 'and',
      },
    },
  },
});

const respondAccepted = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Accepted Result', position: [1810, 260],
    parameters: { respondWith: 'firstIncomingItem', options: { responseCode: 202 } },
  },
});

const slaSchedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Every Minute SLA Check', position: [180, 760],
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } },
  },
  output: [{}],
});

const getLeadEvents = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Get SLA Candidates', position: [450, 760],
    parameters: {
      resource: 'row', operation: 'get', dataTableId: leadEventsTable,
      returnAll: true, orderBy: true, orderByColumn: 'accepted_at', orderByDirection: 'ASC',
    },
  },
  output: [{ id: 1, event_key: 'website:form_submission_1001', status: 'NOTIFIED', lead_class: 'HOT', owner_id: 'owner-alex', reminder_due_at: '2026-09-04T09:40:00.000Z', escalation_due_at: '2026-09-04T10:00:00.000Z', reminder_status: 'PENDING', escalation_status: 'PENDING', first_action_at: null }],
});

const evaluateSla = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Evaluate Due SLA Checkpoint', position: [720, 760],
    parameters: {
      mode: 'runOnceForEachItem', language: 'javaScript',
      jsCode: `const now = Date.now();
let due_type = null;
if (!$json.first_action_at && $json.reminder_status === 'PENDING' && Date.parse($json.reminder_due_at) <= now) due_type = 'REMINDER';
else if (!$json.first_action_at && $json.escalation_status === 'PENDING' && Date.parse($json.escalation_due_at) <= now) due_type = 'ESCALATION';
return { json: {
  ...$json,
  due_type,
  reminder_status: due_type === 'REMINDER' ? 'DELIVERED' : $json.reminder_status,
  escalation_status: due_type === 'ESCALATION' ? 'DELIVERED' : $json.escalation_status
} };`,
    },
  },
  output: [{ id: 1, event_key: 'website:form_submission_1001', due_type: 'REMINDER', reminder_status: 'DELIVERED', escalation_status: 'PENDING', first_action_at: null }],
});

const checkpointDue = ifElse({
  version: 2.3,
  config: {
    name: 'Checkpoint Due?', position: [980, 760],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.due_type }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty' } }],
        combinator: 'and',
      },
    },
  },
});

const markCheckpoint = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark SLA Checkpoint Delivered', position: [1240, 700],
    parameters: {
      resource: 'row', operation: 'update', dataTableId: leadEventsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'event_key', condition: 'eq', keyValue: expr('{{ $json.event_key }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { reminder_status: expr('{{ $json.reminder_status }}'), escalation_status: expr('{{ $json.escalation_status }}') },
        schema: [],
      },
      options: {},
    },
  },
  output: [{ id: 1, updatedAt: '2026-09-04T09:40:00.000Z' }],
});

const slaPreview = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build SLA Alert Preview', position: [1510, 700],
    parameters: {
      mode: 'runOnceForEachItem', language: 'javaScript',
      jsCode: `const candidate = $('Evaluate Due SLA Checkpoint').item.json;
return { json: {
  type: 'SLA_' + candidate.due_type,
  event_key: candidate.event_key,
  recipient: candidate.due_type === 'ESCALATION' ? '#sales-leads' : candidate.owner_id,
  preview: candidate.due_type + ': lead has no first sales action',
  external_messages_sent: 0
} };`,
    },
  },
  output: [{ type: 'SLA_REMINDER', event_key: 'website:form_submission_1001', recipient: 'owner-alex', preview: 'REMINDER: lead has no first sales action', external_messages_sent: 0 }],
});

const captureNote = sticky('## Lead capture and qualification\nWebsite, Meta-compatible and manual demo events converge on one normalization, scoring and routing boundary. Raw payload is persisted with a stable event key before any live side effect.', [websiteWebhook, metaWebhook, normalizeAndScore, persistLeadEvent], { color: 5 });
const safeNote = sticky('## Safe portfolio output\nCRM links and Slack messages are previews only. No credentials are attached and the workflow remains unpublished. Production adapters must use PostgreSQL transactions and explicit HubSpot/Slack credentials.', [buildSafePreview, shouldRespond, respondAccepted], { color: 3 });
const slaNote = sticky('## SLA worker\nA polling worker checks persisted deadlines. It marks a checkpoint before building the alert preview so repeated schedules do not create the same reminder twice.', [slaSchedule, getLeadEvents, evaluateSla, checkpointDue, markCheckpoint, slaPreview], { color: 6 });

export default workflow('revops-lead-engine', 'Portfolio — Revenue Operations Lead Engine')
  .add(manualDemo.to(loadSyntheticLead.to(normalizeAndScore)))
  .add(websiteWebhook.to(normalizeAndScore))
  .add(metaWebhook.to(normalizeAndScore))
  .add(normalizeAndScore.to(persistLeadEvent).to(buildSafePreview).to(
    shouldRespond.onTrue(respondAccepted),
  ))
  .add(slaSchedule.to(getLeadEvents).to(evaluateSla).to(
    checkpointDue.onTrue(markCheckpoint.to(slaPreview)),
  ))
  .add(captureNote)
  .add(safeNote)
  .add(slaNote);
