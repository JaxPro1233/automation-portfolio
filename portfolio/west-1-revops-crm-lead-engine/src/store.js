import { randomUUID } from 'node:crypto';

export class InMemoryLeadStore {
  constructor(seed = {}) {
    this.events = new Map();
    this.eventKeys = new Map();
    this.contacts = new Map();
    this.contactsByEmail = new Map();
    this.contactsByPhone = new Map();
    this.touchpoints = [];
    this.deals = new Map();
    this.scoreResults = [];
    this.owners = new Map((seed.owners ?? []).map((owner) => [owner.id, { ...owner }]));
    this.routingAssignments = [];
    this.slaCheckpoints = [];
    this.outboundActions = new Map();
    this.integrationAttempts = [];
    this.failedEvents = new Map();
    this.auditLog = [];
    this.routingCursor = new Map();
  }

  nextId(prefix) {
    return `${prefix}_${randomUUID()}`;
  }

  appendAudit(entityType, entityId, action, metadata = {}, actor = 'system') {
    const entry = {
      id: this.nextId('audit'), entityType, entityId, action, actor,
      metadata: structuredClone(metadata), at: new Date().toISOString(),
    };
    this.auditLog.push(entry);
    return entry;
  }

  acceptEvent(source, sourceEventId, rawPayload, now) {
    const key = `${source}:${sourceEventId}`;
    const existingId = this.eventKeys.get(key);
    if (existingId) return { duplicate: true, event: this.events.get(existingId) };

    const event = {
      id: this.nextId('evt'), source, sourceEventId,
      rawPayload: structuredClone(rawPayload), status: 'RECEIVED',
      acceptedAt: now.toISOString(), updatedAt: now.toISOString(), errors: [],
    };
    this.events.set(event.id, event);
    this.eventKeys.set(key, event.id);
    this.appendAudit('event', event.id, 'RECEIVED', { source, sourceEventId });
    return { duplicate: false, event };
  }

  setEventStatus(event, status, metadata = {}) {
    event.status = status;
    event.updatedAt = new Date().toISOString();
    if (metadata.errors) event.errors = [...metadata.errors];
    this.appendAudit('event', event.id, status, metadata);
  }

  findContactMatches(email, phone) {
    return {
      byEmail: email ? this.contacts.get(this.contactsByEmail.get(email)) ?? null : null,
      byPhone: phone ? this.contacts.get(this.contactsByPhone.get(phone)) ?? null : null,
    };
  }

  upsertContact(lead, hashes, now) {
    const matches = this.findContactMatches(lead.emailNormalized, lead.phoneNormalized);
    const contact = matches.byEmail ?? matches.byPhone ?? {
      id: this.nextId('contact'), createdAt: now.toISOString(), confirmedFields: [],
    };

    Object.assign(contact, {
      firstName: lead.firstName ?? contact.firstName ?? null,
      lastName: lead.lastName ?? contact.lastName ?? null,
      company: lead.company ?? contact.company ?? null,
      emailOriginal: lead.emailOriginal ?? contact.emailOriginal ?? null,
      emailNormalized: lead.emailNormalized ?? contact.emailNormalized ?? null,
      emailHash: hashes.emailHash ?? contact.emailHash ?? null,
      phoneOriginal: lead.phoneOriginal ?? contact.phoneOriginal ?? null,
      phoneNormalized: lead.phoneNormalized ?? contact.phoneNormalized ?? null,
      phoneHash: hashes.phoneHash ?? contact.phoneHash ?? null,
      consent: lead.consent === true,
      updatedAt: now.toISOString(),
    });

    this.contacts.set(contact.id, contact);
    if (contact.emailNormalized) this.contactsByEmail.set(contact.emailNormalized, contact.id);
    if (contact.phoneNormalized) this.contactsByPhone.set(contact.phoneNormalized, contact.id);
    return contact;
  }

  findOpenDeal(contactId, service, now, windowDays) {
    const cutoff = now.getTime() - windowDays * 86_400_000;
    return [...this.deals.values()].find((deal) => (
      deal.contactId === contactId
      && deal.service === service
      && !['DISQUALIFIED', 'CLOSED_WON', 'CLOSED_LOST'].includes(deal.stage)
      && Date.parse(deal.createdAt) >= cutoff
    )) ?? null;
  }

  createDeal(contactId, service, now) {
    const deal = {
      id: this.nextId('deal'), contactId, service: service ?? 'unspecified',
      stage: 'QUALIFIED', ownerId: null, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    this.deals.set(deal.id, deal);
    this.appendAudit('deal', deal.id, 'CREATED', { contactId, service: deal.service });
    return deal;
  }

  saveOutbound(action) {
    const existing = this.outboundActions.get(action.idempotencyKey);
    if (existing) return { duplicate: true, action: existing };
    const saved = { id: this.nextId('out'), ...action };
    this.outboundActions.set(action.idempotencyKey, saved);
    return { duplicate: false, action: saved };
  }

  snapshot() {
    return {
      events: [...this.events.values()], contacts: [...this.contacts.values()],
      touchpoints: this.touchpoints, deals: [...this.deals.values()],
      scores: this.scoreResults, assignments: this.routingAssignments,
      slaCheckpoints: this.slaCheckpoints,
      outboundActions: [...this.outboundActions.values()],
      integrationAttempts: this.integrationAttempts,
      failedEvents: [...this.failedEvents.values()], auditLog: this.auditLog,
    };
  }
}
