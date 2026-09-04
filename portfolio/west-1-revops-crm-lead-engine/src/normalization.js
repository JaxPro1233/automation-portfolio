import { createHash } from 'node:crypto';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_TAGS = /<[^>]*>/g;

export function cleanText(value, maxLength = 2000) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value)
    .replace(CONTROL_CHARS, '')
    .replace(HTML_TAGS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

export function normalizeEmail(value, plusTagDomains = []) {
  const original = cleanText(value, 320);
  if (!original) return { original: null, normalized: null, valid: false };

  let normalized = original.toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) {
    return { original, normalized, valid: false };
  }

  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (plusTagDomains.includes(domain)) {
    normalized = `${local.split('+')[0]}@${domain}`;
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  return { original, normalized, valid };
}

export function normalizePhone(value, defaultCountryCode = '1') {
  const original = cleanText(value, 64);
  if (!original) {
    return { original: null, normalized: null, valid: false, warning: null };
  }

  const hadPlus = original.trim().startsWith('+');
  const digits = original.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return { original, normalized: null, valid: false, warning: 'PHONE_LENGTH_INVALID' };
  }

  const international = hadPlus ? digits : `${defaultCountryCode}${digits}`;
  if (international.length > 15) {
    return { original, normalized: null, valid: false, warning: 'PHONE_COUNTRY_CONTEXT_INVALID' };
  }

  return {
    original,
    normalized: `+${international}`,
    valid: true,
    warning: hadPlus ? null : 'PHONE_COUNTRY_CODE_INFERRED',
  };
}

export function stableHash(value, salt = 'portfolio-demo') {
  if (!value) return null;
  return createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function pickMetaField(fieldData, name) {
  const entry = Array.isArray(fieldData)
    ? fieldData.find((field) => field?.name === name)
    : null;
  return entry?.values?.[0] ?? null;
}

export function adaptLeadEvent(source, payload, options = {}) {
  const received = payload?.body ?? payload ?? {};
  let canonical;

  if (source === 'meta') {
    const value = received.value ?? received;
    const fields = received.field_data ?? value.field_data ?? [];
    const fullName = cleanText(pickMetaField(fields, 'full_name'), 200) ?? '';
    const [firstName, ...lastParts] = fullName.split(' ');
    const leadgenId = String(value.leadgen_id ?? received.id ?? '');

    canonical = {
      eventType: 'lead.submitted',
      occurredAt: value.created_time
        ? new Date(Number(value.created_time) * 1000).toISOString()
        : (received.created_time ?? options.now?.toISOString()),
      source: 'meta',
      sourceEventId: leadgenId,
      lead: {
        firstName: pickMetaField(fields, 'first_name') ?? firstName,
        lastName: pickMetaField(fields, 'last_name') ?? lastParts.join(' '),
        email: pickMetaField(fields, 'email'),
        phone: pickMetaField(fields, 'phone_number'),
        company: pickMetaField(fields, 'company_name'),
        territory: pickMetaField(fields, 'territory'),
        service: pickMetaField(fields, 'service'),
        message: pickMetaField(fields, 'message'),
        consent: pickMetaField(fields, 'consent') !== 'false',
      },
      attribution: {
        utmSource: 'meta',
        utmMedium: 'paid_social',
        utmCampaign: cleanText(received.utm_campaign),
        landingPage: null,
        formId: value.form_id ? String(value.form_id) : null,
        adId: value.ad_id ? String(value.ad_id) : null,
      },
      needsEnrichment: fields.length === 0,
    };
  } else {
    canonical = {
      eventType: received.event_type ?? 'lead.submitted',
      occurredAt: received.occurred_at ?? options.now?.toISOString(),
      source: 'website',
      sourceEventId: String(received.source_event_id ?? ''),
      lead: {
        firstName: received.lead?.first_name ?? received.first_name,
        lastName: received.lead?.last_name ?? received.last_name,
        email: received.lead?.email ?? received.email,
        phone: received.lead?.phone ?? received.phone,
        company: received.lead?.company ?? received.company,
        territory: received.lead?.territory ?? received.territory,
        service: received.lead?.service ?? received.service,
        message: received.lead?.message ?? received.message,
        consent: received.lead?.consent ?? received.consent ?? false,
      },
      attribution: {
        utmSource: received.attribution?.utm_source ?? received.utm_source,
        utmMedium: received.attribution?.utm_medium ?? received.utm_medium,
        utmCampaign: received.attribution?.utm_campaign ?? received.utm_campaign,
        landingPage: received.attribution?.landing_page ?? received.landing_page,
        formId: null,
        adId: null,
      },
      needsEnrichment: false,
    };
  }

  const email = normalizeEmail(canonical.lead.email, options.plusTagDomains);
  const phone = normalizePhone(canonical.lead.phone, options.defaultCountryCode);

  return {
    ...canonical,
    lead: {
      firstName: cleanText(canonical.lead.firstName, 100),
      lastName: cleanText(canonical.lead.lastName, 100),
      company: cleanText(canonical.lead.company, 200),
      territory: cleanText(canonical.lead.territory, 50),
      service: cleanText(canonical.lead.service, 100),
      message: cleanText(canonical.lead.message, 2000),
      consent: canonical.lead.consent === true,
      emailOriginal: email.original,
      emailNormalized: email.valid ? email.normalized : null,
      phoneOriginal: phone.original,
      phoneNormalized: phone.valid ? phone.normalized : null,
      normalizationWarnings: [phone.warning].filter(Boolean),
    },
    attribution: Object.fromEntries(
      Object.entries(canonical.attribution).map(([key, value]) => [key, cleanText(value, 500)]),
    ),
  };
}

export function validateLeadEvent(event) {
  const errors = [];
  if (event.eventType !== 'lead.submitted') errors.push('EVENT_TYPE_UNSUPPORTED');
  if (!event.sourceEventId) errors.push('SOURCE_EVENT_ID_REQUIRED');
  if (!event.occurredAt || Number.isNaN(Date.parse(event.occurredAt))) errors.push('OCCURRED_AT_INVALID');
  if (event.needsEnrichment) errors.push('META_LEAD_ENRICHMENT_REQUIRED');
  if (!event.lead.emailNormalized && !event.lead.phoneNormalized) {
    errors.push('EMAIL_OR_PHONE_REQUIRED');
  }
  return { valid: errors.length === 0, errors };
}
