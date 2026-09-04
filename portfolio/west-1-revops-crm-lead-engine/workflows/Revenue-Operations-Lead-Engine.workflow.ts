import { workflow, node, trigger, sticky, ifElse, expr, newCredential } from '@n8n/workflow-sdk';

const leadEventsTable = {
  __rl: true,
  mode: 'id',
  value: 'kk0YJ2G8ISulRlCu',
  cachedResultName: 'Portfolio RevOps Lead Events',
};

const failureQueueTable = {
  __rl: true,
  mode: 'id',
  value: 'Nycdvcip0NBtoGqe',
  cachedResultName: 'Portfolio RevOps Failure Queue',
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

const metaPayloadComplete = ifElse({
  version: 2.3,
  config: {
    name: 'Meta Payload Complete?', position: [470, 500],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          leftValue: expr('{{ Array.isArray($json.body?.field_data ?? $json.field_data) && ($json.body?.field_data ?? $json.field_data).length > 0 }}'),
          rightValue: true,
          operator: { type: 'boolean', operation: 'true' },
        }],
        combinator: 'and',
      },
    },
  },
});

const fetchMetaLead = node({
  type: 'n8n-nodes-base.facebookGraphApi',
  version: 1,
  config: {
    name: 'Meta · Retrieve Lead Details', position: [700, 560],
    credentials: { facebookGraphApi: newCredential('RevOps Meta Graph API') },
    parameters: {
      authType: 'accessToken', hostUrl: 'graph.facebook.com', httpRequestMethod: 'GET',
      graphApiVersion: 'v25.0', node: expr('{{ $json.body?.leadgen_id ?? $json.leadgen_id }}'),
      options: { fields: { field: [{ name: 'id' }, { name: 'created_time' }, { name: 'field_data' }] } },
    },
  },
  output: [{ id: 'meta-lead-2001', created_time: '2026-09-04T09:30:00Z', field_data: [] }],
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
const isMeta = Boolean(incoming.leadgen_id || (incoming.id && Array.isArray(incoming.field_data)));
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
const valid = Boolean((email || phone) && (incoming.source_event_id || incoming.leadgen_id || incoming.id) && (!isMeta || fields.length));
const now = new Date();
const reminderMs = leadClass === 'HOT' ? 600000 : leadClass === 'WARM' ? 1800000 : 14400000;
const escalationMs = leadClass === 'HOT' ? 1800000 : leadClass === 'WARM' ? 7200000 : 86400000;
const source = isMeta ? 'meta' : 'website';
const sourceEventId = String(incoming.leadgen_id ?? incoming.id ?? incoming.source_event_id ?? '')
  .replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 180);
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
  first_name: clean(rawLead.first_name, 120), last_name: clean(rawLead.last_name, 120),
  email, phone, company: clean(rawLead.company, 200), service,
  message: clean(rawLead.message), consent: rawLead.consent === true,
  execution_mode: incoming._trigger_kind === 'manual' ? 'DEMO' : 'LIVE',
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
    first_name: 'Alex', last_name: 'Morgan', email: 'alex.morgan+demo@example.com',
    phone: '+14155550184', company: 'Northwind Studio', service: 'crm_automation',
    message: 'We need to respond to inbound leads faster and prevent duplicate CRM records.',
    consent: true, execution_mode: 'DEMO',
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

const productionMode = ifElse({
  version: 2.3,
  config: {
    name: 'Deployment Mode LIVE?', position: [1010, 320],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.execution_mode }}'), rightValue: 'LIVE', operator: { type: 'string', operation: 'equals' } }],
        combinator: 'and',
      },
    },
  },
});

const persistProductionLead = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'PostgreSQL · Atomic Lead Transaction', position: [1260, 210],
    credentials: { postgres: newCredential('RevOps PostgreSQL') },
    parameters: {
      resource: 'database', operation: 'executeQuery',
      query: `WITH event_row AS (
  INSERT INTO revops.lead_events (source, source_event_id, status, raw_payload)
  VALUES ($1, $2, 'QUALIFIED', jsonb_build_object('event_key', $3))
  ON CONFLICT (source, source_event_id) DO UPDATE SET updated_at = now()
  RETURNING id, source, source_event_id, status
)
SELECT *, $3::text AS event_key FROM event_row;`,
      options: {
        queryBatching: 'transaction',
        queryReplacement: expr('{{ $json.source + "," + $json.source_event_id + "," + $json.event_key }}'),
        replaceEmptyStrings: true,
      },
    },
  },
  output: [{ id: '00000000-0000-0000-0000-000000000001', source: 'website', source_event_id: 'form_submission_1001', status: 'QUALIFIED', event_key: 'website:form_submission_1001' }],
});

const upsertHubspotContact = node({
  type: 'n8n-nodes-base.hubspot',
  version: 2.2,
  config: {
    name: 'HubSpot · Upsert Contact', position: [1510, 210],
    credentials: { hubspotAppToken: newCredential('RevOps HubSpot Private App') },
    parameters: {
      resource: 'contact', operation: 'upsert', authentication: 'appToken',
      email: expr("{{ $('Normalize Score and Route').item.json.email }}"),
      additionalFields: {
        firstName: expr("{{ $('Normalize Score and Route').item.json.first_name }}"),
        lastName: expr("{{ $('Normalize Score and Route').item.json.last_name }}"),
        phoneNumber: expr("{{ $('Normalize Score and Route').item.json.phone }}"),
        companyName: expr("{{ $('Normalize Score and Route').item.json.company }}"),
        message: expr("{{ $('Normalize Score and Route').item.json.message }}"),
      },
    },
  },
  output: [{ id: 'hubspot-contact-id' }],
});

const searchHubspotDeal = node({
  type: 'n8n-nodes-base.hubspot',
  version: 2.2,
  config: {
    name: 'HubSpot · Find Deal by Event Key', position: [1760, 210],
    alwaysOutputData: true,
    credentials: { hubspotAppToken: newCredential('RevOps HubSpot Private App') },
    parameters: {
      resource: 'deal', operation: 'search', authentication: 'appToken', returnAll: false, limit: 1,
      filterGroupsUi: { filterGroupsValues: [{ filtersUi: { filterValues: [{
        propertyName: 'revops_event_key', operator: 'EQ',
        value: expr("{{ $('Normalize Score and Route').item.json.event_key }}"),
      }] } }] },
      additionalFields: { properties: ['dealname', 'dealstage', 'pipeline', 'revops_event_key'] },
    },
  },
  output: [{ id: 'hubspot-deal-id', properties: { revops_event_key: 'website:form_submission_1001' } }],
});

const hubspotDealExists = ifElse({
  version: 2.3,
  config: {
    name: 'HubSpot Deal Exists?', position: [2010, 210],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.id }}'), rightValue: '', operator: { type: 'string', operation: 'notEmpty' } }],
        combinator: 'and',
      },
    },
  },
});

const updateHubspotDeal = node({
  type: 'n8n-nodes-base.hubspot',
  version: 2.2,
  config: {
    name: 'HubSpot · Update Existing Deal', position: [2260, 120],
    credentials: { hubspotAppToken: newCredential('RevOps HubSpot Private App') },
    parameters: {
      resource: 'deal', operation: 'update', authentication: 'appToken',
      dealId: { __rl: true, mode: 'id', value: expr('{{ $json.id }}') },
      updateFields: {
        dealName: expr("{{ $('Normalize Score and Route').item.json.company + ' · ' + $('Normalize Score and Route').item.json.service }}"),
        description: expr("{{ $('Normalize Score and Route').item.json.message }}"),
      },
    },
  },
  output: [{ id: 'hubspot-deal-id', url: 'https://app.hubspot.com/contacts/example/deal/hubspot-deal-id' }],
});

const createHubspotDeal = node({
  type: 'n8n-nodes-base.hubspot',
  version: 2.2,
  config: {
    name: 'HubSpot · Create Idempotent Deal', position: [2260, 300],
    credentials: { hubspotAppToken: newCredential('RevOps HubSpot Private App') },
    parameters: {
      resource: 'deal', operation: 'create', authentication: 'appToken', stage: 'appointmentscheduled',
      additionalFields: {
        pipeline: 'default',
        dealName: expr("{{ $('Normalize Score and Route').item.json.company + ' · ' + $('Normalize Score and Route').item.json.service }}"),
        description: expr("{{ $('Normalize Score and Route').item.json.message }}"),
        customPropertiesUi: { customPropertiesValues: [{
          property: 'revops_event_key', value: expr("{{ $('Normalize Score and Route').item.json.event_key }}"),
        }] },
      },
    },
  },
  output: [{ id: 'hubspot-deal-id', url: 'https://app.hubspot.com/contacts/example/deal/hubspot-deal-id' }],
});

const buildExistingLeadAlert = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Build Lead Alert · Existing Deal', position: [2500, 120],
    parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: `const lead = $('Normalize Score and Route').item.json;
return { json: { ...$json, event_key: lead.event_key, _respond: lead._respond,
  slack_text: '*'+lead.lead_class+' lead · '+lead.score+'/100*\\n'+lead.company+' · '+lead.email_masked+'\\nOwner: '+lead.owner_id+'\\nDeal updated: '+($json.url ?? $json.id) } };` },
  },
});

const buildNewLeadAlert = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Build Lead Alert · New Deal', position: [2500, 300],
    parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: `const lead = $('Normalize Score and Route').item.json;
return { json: { ...$json, event_key: lead.event_key, _respond: lead._respond,
  slack_text: '*'+lead.lead_class+' lead · '+lead.score+'/100*\\n'+lead.company+' · '+lead.email_masked+'\\nOwner: '+lead.owner_id+'\\nDeal created: '+($json.url ?? $json.id) } };` },
  },
});

const postExistingLeadSlack = node({
  type: 'n8n-nodes-base.slack', version: 2.6,
  config: {
    name: 'Slack · Notify Existing Deal', position: [2740, 120],
    credentials: { slackApi: newCredential('RevOps Slack Bot') },
    parameters: {
      resource: 'message', operation: 'post', authentication: 'accessToken', select: 'channel',
      channelId: { __rl: true, mode: 'name', value: 'sales-leads' },
      messageType: 'text', text: expr('{{ $json.slack_text }}'), otherOptions: { includeLinkToWorkflow: true },
    },
  },
});

const postNewLeadSlack = node({
  type: 'n8n-nodes-base.slack', version: 2.6,
  config: {
    name: 'Slack · Notify New Deal', position: [2740, 300],
    credentials: { slackApi: newCredential('RevOps Slack Bot') },
    parameters: {
      resource: 'message', operation: 'post', authentication: 'accessToken', select: 'channel',
      channelId: { __rl: true, mode: 'name', value: 'sales-leads' },
      messageType: 'text', text: expr('{{ $json.slack_text }}'), otherOptions: { includeLinkToWorkflow: true },
    },
  },
});

const markExistingNotified = node({
  type: 'n8n-nodes-base.postgres', version: 2.7,
  config: {
    name: 'PostgreSQL · Mark Existing Notified', position: [2980, 120],
    credentials: { postgres: newCredential('RevOps PostgreSQL') },
    parameters: {
      resource: 'database', operation: 'executeQuery',
      query: `UPDATE revops.lead_events SET status = 'NOTIFIED', updated_at = now()
WHERE source = $1 AND source_event_id = $2 RETURNING id, status;`,
      options: {
        queryReplacement: expr("{{ $('Normalize Score and Route').item.json.source + ',' + $('Normalize Score and Route').item.json.source_event_id }}"),
      },
    },
  },
  output: [{ id: '00000000-0000-0000-0000-000000000001', status: 'NOTIFIED' }],
});

const markNewNotified = node({
  type: 'n8n-nodes-base.postgres', version: 2.7,
  config: {
    name: 'PostgreSQL · Mark New Notified', position: [2980, 300],
    credentials: { postgres: newCredential('RevOps PostgreSQL') },
    parameters: {
      resource: 'database', operation: 'executeQuery',
      query: `UPDATE revops.lead_events SET status = 'NOTIFIED', updated_at = now()
WHERE source = $1 AND source_event_id = $2 RETURNING id, status;`,
      options: {
        queryReplacement: expr("{{ $('Normalize Score and Route').item.json.source + ',' + $('Normalize Score and Route').item.json.source_event_id }}"),
      },
    },
  },
  output: [{ id: '00000000-0000-0000-0000-000000000001', status: 'NOTIFIED' }],
});

const existingResult = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Return Production Result · Existing', position: [3220, 120],
    parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: `const lead = $('Normalize Score and Route').item.json;
return { json: { accepted: true, status: 'NOTIFIED', event_key: lead.event_key,
  score: lead.score, lead_class: lead.lead_class, owner_id: lead.owner_id,
  persistence: 'PostgreSQL', crm: 'HubSpot', notification: 'Slack', _respond: lead._respond } };` },
  },
});

const newResult = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Return Production Result · New', position: [3220, 300],
    parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: `const lead = $('Normalize Score and Route').item.json;
return { json: { accepted: true, status: 'NOTIFIED', event_key: lead.event_key,
  score: lead.score, lead_class: lead.lead_class, owner_id: lead.owner_id,
  persistence: 'PostgreSQL', crm: 'HubSpot', notification: 'Slack', _respond: lead._respond } };` },
  },
});

const respondProductionExisting = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'HTTP 202 · Existing Deal', position: [3460, 120], parameters: { respondWith: 'firstIncomingItem', options: { responseCode: 202 } } },
});

const respondProductionNew = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'HTTP 202 · New Deal', position: [3460, 300], parameters: { respondWith: 'firstIncomingItem', options: { responseCode: 202 } } },
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
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'PostgreSQL · Lock Due SLA Candidates', position: [450, 760],
    credentials: { postgres: newCredential('RevOps PostgreSQL') },
    parameters: {
      resource: 'database', operation: 'executeQuery',
      query: `SELECT sc.id AS checkpoint_id, sc.checkpoint_type AS due_type,
       d.id AS deal_id, d.owner_id, d.crm_url, d.first_action_at
FROM revops.sla_checkpoints sc
JOIN revops.deals d ON d.id = sc.deal_id
WHERE sc.status = 'PENDING' AND sc.due_at <= now() AND d.first_action_at IS NULL
ORDER BY sc.due_at ASC
LIMIT 100
FOR UPDATE OF sc SKIP LOCKED;`,
      options: { queryBatching: 'transaction' },
    },
  },
  output: [{ checkpoint_id: '00000000-0000-0000-0000-000000000002', deal_id: '00000000-0000-0000-0000-000000000001', due_type: 'REMINDER', owner_id: 'owner-alex', crm_url: 'https://app.hubspot.com/deal/1', first_action_at: null }],
});

const evaluateSla = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Evaluate Due SLA Checkpoint', position: [720, 760],
    parameters: {
      mode: 'runOnceForEachItem', language: 'javaScript',
      jsCode: `const due_type = ['REMINDER', 'ESCALATION'].includes($json.due_type) ? $json.due_type : null;
return { json: { ...$json, due_type } };`,
    },
  },
  output: [{ checkpoint_id: '00000000-0000-0000-0000-000000000002', deal_id: '00000000-0000-0000-0000-000000000001', due_type: 'REMINDER', owner_id: 'owner-alex', crm_url: 'https://app.hubspot.com/deal/1', first_action_at: null }],
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
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'PostgreSQL · Mark SLA Delivered', position: [1990, 700],
    credentials: { postgres: newCredential('RevOps PostgreSQL') },
    parameters: {
      resource: 'database', operation: 'executeQuery',
      query: `UPDATE revops.sla_checkpoints
SET status = 'DELIVERED', completed_at = now()
WHERE id = $1::uuid AND status = 'PENDING'
RETURNING id, deal_id, checkpoint_type, status;`,
      options: { queryReplacement: expr("{{ $('Evaluate Due SLA Checkpoint').item.json.checkpoint_id }}") },
    },
  },
  output: [{ id: '00000000-0000-0000-0000-000000000002', status: 'DELIVERED' }],
});

const slaPreview = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build SLA Alert', position: [1510, 700],
    parameters: {
      mode: 'runOnceForEachItem', language: 'javaScript',
      jsCode: `const candidate = $('Evaluate Due SLA Checkpoint').item.json;
return { json: {
  type: 'SLA_' + candidate.due_type,
  event_key: candidate.event_key,
  recipient: candidate.due_type === 'ESCALATION' ? '#sales-leads' : candidate.owner_id,
  preview: candidate.due_type + ': lead has no first sales action',
  external_messages_sent: 1
} };`,
    },
  },
  output: [{ type: 'SLA_REMINDER', event_key: 'website:form_submission_1001', recipient: 'owner-alex', preview: 'REMINDER: lead has no first sales action', external_messages_sent: 0 }],
});

const postSlaSlack = node({
  type: 'n8n-nodes-base.slack', version: 2.6,
  config: {
    name: 'Slack · Deliver SLA Alert', position: [1750, 700],
    credentials: { slackApi: newCredential('RevOps Slack Bot') },
    parameters: {
      resource: 'message', operation: 'post', authentication: 'accessToken', select: 'channel',
      channelId: { __rl: true, mode: 'name', value: 'sales-leads' },
      messageType: 'text', text: expr('{{ $json.preview }}'), otherOptions: { includeLinkToWorkflow: true },
    },
  },
});

const errorTrigger = trigger({
  type: 'n8n-nodes-base.errorTrigger', version: 1,
  config: { name: 'Production Error Trigger', position: [180, 1060], parameters: {} },
  output: [{ execution: { id: 'execution-id', error: { message: 'Adapter failed' }, lastNodeExecuted: 'HubSpot · Upsert Contact' }, workflow: { id: 'workflow-id' } }],
});

const buildFailureEnvelope = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Build Safe Failure Envelope', position: [430, 1060],
    parameters: {
      mode: 'runOnceForEachItem', language: 'javaScript',
      jsCode: `const execution = $json.execution ?? {};
const workflow = $json.workflow ?? {};
const now = new Date().toISOString();
const executionId = String(execution.id ?? 'unknown');
return { json: {
  failure_key: String(workflow.id ?? 'workflow') + ':' + executionId,
  workflow_id: String(workflow.id ?? ''), execution_id: executionId,
  failed_node: String(execution.lastNodeExecuted ?? 'unknown'),
  error_message: String(execution.error?.message ?? 'Unknown error').slice(0, 500),
  status: 'OPEN', attempts: 0, event_key: '', raw_payload: '{}',
  created_at: now, updated_at: now
} };`,
    },
  },
});

const persistFailure = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Failure Queue · Idempotent Upsert', position: [700, 1060],
    parameters: {
      resource: 'row', operation: 'upsert', dataTableId: failureQueueTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'failure_key', condition: 'eq', keyValue: expr('{{ $json.failure_key }}') }] },
      columns: { mappingMode: 'defineBelow', matchingColumns: ['failure_key'], value: {
        failure_key: expr('{{ $json.failure_key }}'), workflow_id: expr('{{ $json.workflow_id }}'),
        execution_id: expr('{{ $json.execution_id }}'), failed_node: expr('{{ $json.failed_node }}'),
        error_message: expr('{{ $json.error_message }}'), status: expr('{{ $json.status }}'),
        attempts: expr('{{ $json.attempts }}'), event_key: expr('{{ $json.event_key }}'),
        raw_payload: expr('{{ $json.raw_payload }}'), created_at: expr('{{ $json.created_at }}'),
        updated_at: expr('{{ $json.updated_at }}'),
      }, schema: [] }, options: {},
    },
  },
});

const postFailureSlack = node({
  type: 'n8n-nodes-base.slack', version: 2.6,
  config: {
    name: 'Slack · Notify Operations Failure', position: [970, 1060],
    credentials: { slackApi: newCredential('RevOps Slack Bot') },
    parameters: {
      resource: 'message', operation: 'post', authentication: 'accessToken', select: 'channel',
      channelId: { __rl: true, mode: 'name', value: 'revops-alerts' }, messageType: 'text',
      text: expr("{{ '*RevOps automation failed*\\nNode: ' + $('Build Safe Failure Envelope').item.json.failed_node + '\\nExecution: ' + $('Build Safe Failure Envelope').item.json.execution_id }}"),
      otherOptions: { includeLinkToWorkflow: true },
    },
  },
});

const replayWebhook = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: {
    name: 'POST Secure Failure Replay', position: [180, 1280],
    credentials: { httpHeaderAuth: newCredential('RevOps Webhook Admin Auth') },
    parameters: {
      httpMethod: 'POST', path: 'portfolio/revops-leads/replay', authentication: 'headerAuth',
      responseMode: 'responseNode', options: { allowedOrigins: '' },
    },
  },
  output: [{ body: { failure_key: 'workflow-id:execution-id' }, headers: {}, query: {}, params: {} }],
});

const getFailureForReplay = node({
  type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: {
    name: 'Failure Queue · Load Open Item', position: [450, 1280],
    parameters: {
      resource: 'row', operation: 'get', dataTableId: failureQueueTable,
      matchType: 'allConditions', filters: { conditions: [
        { keyName: 'failure_key', condition: 'eq', keyValue: expr('{{ $json.body.failure_key }}') },
        { keyName: 'status', condition: 'eq', keyValue: 'OPEN' },
      ] }, returnAll: false, limit: 1,
    },
  },
  output: [{ failure_key: 'workflow-id:execution-id', status: 'OPEN', raw_payload: '{}' }],
});

const prepareReplay = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: {
    name: 'Restore Immutable Original Event', position: [720, 1280],
    parameters: {
      mode: 'runOnceForEachItem', language: 'javaScript',
      jsCode: `const payload = JSON.parse($json.raw_payload || '{}');
payload._trigger_kind = 'replay';
return { json: payload };`,
    },
  },
});

const managerActionWebhook = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: {
    name: 'POST Manager First Action', position: [180, 1480],
    credentials: { httpHeaderAuth: newCredential('RevOps Webhook Admin Auth') },
    parameters: {
      httpMethod: 'POST', path: 'portfolio/revops-leads/first-action', authentication: 'headerAuth',
      responseMode: 'responseNode', options: { allowedOrigins: '' },
    },
  },
  output: [{ body: { deal_id: '00000000-0000-0000-0000-000000000001' }, headers: {}, query: {}, params: {} }],
});

const cancelSlaInPostgres = node({
  type: 'n8n-nodes-base.postgres', version: 2.7,
  config: {
    name: 'PostgreSQL · Record Action and Cancel SLA', position: [470, 1480],
    credentials: { postgres: newCredential('RevOps PostgreSQL') },
    parameters: {
      resource: 'database', operation: 'executeQuery',
      query: `WITH updated_deal AS (
  UPDATE revops.deals SET first_action_at = now(), updated_at = now()
  WHERE id = $1::uuid AND first_action_at IS NULL RETURNING id
)
UPDATE revops.sla_checkpoints SET status = 'CANCELLED', completed_at = now()
WHERE deal_id IN (SELECT id FROM updated_deal) AND status = 'PENDING'
RETURNING deal_id, status;`,
      options: { queryReplacement: expr('{{ $json.body.deal_id }}'), queryBatching: 'transaction' },
    },
  },
});

const respondManagerAction = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'HTTP 200 · SLA Cancelled', position: [760, 1480], parameters: { respondWith: 'firstIncomingItem', options: { responseCode: 200 } } },
});

const captureNote = sticky('## Capture and qualification\nWebsite and Meta webhooks run the LIVE branch. Meta notifications missing field_data are enriched through Graph API v25. Manual execution alone stays in credential-free DEMO mode.', [websiteWebhook, metaWebhook, metaPayloadComplete, fetchMetaLead, normalizeAndScore, productionMode], { color: 5 });
const productionNote = sticky('## Production delivery\nA PostgreSQL transaction establishes idempotency before HubSpot or Slack. Contact upsert and deal search prevent duplicates; the event is marked NOTIFIED only after Slack succeeds.', [persistProductionLead, upsertHubspotContact, searchHubspotDeal, hubspotDealExists, updateHubspotDeal, createHubspotDeal, postExistingLeadSlack, postNewLeadSlack, markExistingNotified, markNewNotified], { color: 3 });
const demoNote = sticky('## Safe deterministic demo\nThe manual trigger exercises the same scoring boundary but deliberately follows Data Table and preview nodes, so reviewers can run it without credentials or outbound messages.', [persistLeadEvent, buildSafePreview, shouldRespond, respondAccepted], { color: 4 });
const slaNote = sticky('## SLA delivery\nPostgreSQL locks due checkpoints. The alert is built and delivered to Slack first; only a successful delivery marks the checkpoint DELIVERED.', [slaSchedule, getLeadEvents, evaluateSla, checkpointDue, slaPreview, postSlaSlack, markCheckpoint], { color: 6 });
const recoveryNote = sticky('## Recovery and operational control\nProduction failures are stored idempotently and notify RevOps. Authenticated replay restores the original event. Manager action atomically records first response and cancels pending SLA.', [errorTrigger, buildFailureEnvelope, persistFailure, postFailureSlack, replayWebhook, getFailureForReplay, prepareReplay, managerActionWebhook, cancelSlaInPostgres, respondManagerAction], { color: 2 });

export default workflow('revops-lead-engine', 'Portfolio — Revenue Operations Lead Engine')
  .add(manualDemo.to(loadSyntheticLead.to(normalizeAndScore)))
  .add(websiteWebhook.to(normalizeAndScore))
  .add(metaWebhook.to(metaPayloadComplete
    .onTrue(normalizeAndScore)
    .onFalse(fetchMetaLead.to(normalizeAndScore))))
  .add(normalizeAndScore.to(productionMode
    .onFalse(persistLeadEvent.to(buildSafePreview).to(shouldRespond.onTrue(respondAccepted)))
    .onTrue(persistProductionLead.to(upsertHubspotContact).to(searchHubspotDeal).to(
      hubspotDealExists
        .onTrue(updateHubspotDeal.to(buildExistingLeadAlert).to(postExistingLeadSlack).to(markExistingNotified).to(existingResult).to(respondProductionExisting))
        .onFalse(createHubspotDeal.to(buildNewLeadAlert).to(postNewLeadSlack).to(markNewNotified).to(newResult).to(respondProductionNew)),
    ))))
  .add(slaSchedule.to(getLeadEvents).to(evaluateSla).to(
    checkpointDue.onTrue(slaPreview.to(postSlaSlack).to(markCheckpoint)),
  ))
  .add(errorTrigger.to(buildFailureEnvelope).to(persistFailure).to(postFailureSlack))
  .add(replayWebhook.to(getFailureForReplay).to(prepareReplay).to(normalizeAndScore))
  .add(managerActionWebhook.to(cancelSlaInPostgres).to(respondManagerAction))
  .add(captureNote)
  .add(productionNote)
  .add(demoNote)
  .add(slaNote)
  .add(recoveryNote);
