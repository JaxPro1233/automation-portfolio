import { adaptLeadEvent, stableHash, validateLeadEvent } from './normalization.js';
import { fallbackSummary, scoreLead } from './scoring.js';
import { routeLead } from './routing.js';
import { withRetry } from './retry.js';
import { FallbackAiAdapter, MockCrmAdapter, PreviewNotificationAdapter } from './adapters.js';

const DEFAULT_SLA_MS = {
  HOT: { reminder: 10 * 60_000, escalation: 30 * 60_000 },
  WARM: { reminder: 30 * 60_000, escalation: 120 * 60_000 },
  COLD: { reminder: 4 * 60 * 60_000, escalation: 24 * 60 * 60_000 },
};

function displayName(contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown lead';
}

function safeNotificationText({ contact, event, deal, scoreResult, summary, owner, deadline }) {
  const maskedEmail = contact.emailNormalized
    ? contact.emailNormalized.replace(/^(.).+(@.+)$/, '$1***$2')
    : 'not supplied';
  const maskedPhone = contact.phoneNormalized
    ? `${contact.phoneNormalized.slice(0, 3)}***${contact.phoneNormalized.slice(-2)}`
    : 'not supplied';
  return [
    `New ${scoreResult.leadClass} lead: ${displayName(contact)}`,
    `Company: ${contact.company ?? 'not supplied'}`,
    `Contact: ${maskedEmail} / ${maskedPhone}`,
    `Source: ${event.source}${event.attribution.utmCampaign ? ` / ${event.attribution.utmCampaign}` : ''}`,
    `Score: ${scoreResult.score}/100`,
    `Summary: ${summary.text}`,
    `Owner: ${owner.name}`,
    `CRM: ${deal.crmUrl}`,
    `First-action deadline: ${deadline.toISOString()}`,
  ].join('\n');
}

export class LeadEngine {
  constructor(options) {
    this.store = options.store;
    this.crm = options.crm ?? new MockCrmAdapter();
    this.notifications = options.notifications ?? new PreviewNotificationAdapter(this.store);
    this.ai = options.ai ?? new FallbackAiAdapter();
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.config = {
      defaultCountryCode: '1',
      plusTagDomains: ['gmail.com'],
      dealDedupeWindowDays: 30,
      fallbackOwnerId: 'owner-fallback',
      slaTimeScale: 1,
      ...options.config,
    };
  }

  recordIntegrationAttempts(eventId, operation, attempts, at) {
    for (const attempt of attempts) {
      this.store.integrationAttempts.push({
        id: this.store.nextId('attempt'), eventId, adapter: 'crm', operation,
        ...attempt, at: at.toISOString(),
      });
    }
  }

  async callCrm(eventId, operation, fn, now) {
    try {
      const result = await withRetry(fn, {
        maxAttempts: 5, sleep: this.sleep, baseMs: 250, jitter: () => 0,
      });
      this.recordIntegrationAttempts(eventId, operation, result.attempts, now);
      return result.value;
    } catch (error) {
      this.recordIntegrationAttempts(eventId, operation, error.attempts ?? [], now);
      throw error;
    }
  }

  createFailedEvent(event, step, error, now) {
    const key = `${event.id}:${step}`;
    const existing = this.store.failedEvents.get(key);
    const failed = {
      id: existing?.id ?? this.store.nextId('failed'), eventId: event.id, step,
      errorCode: error.code ?? 'INTEGRATION_ERROR', statusCode: error.statusCode ?? null,
      attempts: error.attempts?.length ?? 1, resolutionStatus: 'OPEN',
      nextAction: 'Fix the adapter/configuration and replay this event',
      createdAt: existing?.createdAt ?? now.toISOString(), updatedAt: now.toISOString(),
    };
    this.store.failedEvents.set(key, failed);
    return failed;
  }

  async process(source, rawPayload, processOptions = {}) {
    const now = processOptions.now ?? this.now();
    const preliminary = adaptLeadEvent(source, rawPayload, {
      now, defaultCountryCode: this.config.defaultCountryCode,
      plusTagDomains: this.config.plusTagDomains,
    });

    if (!preliminary.sourceEventId) {
      return { accepted: false, status: 'REJECTED', errors: ['SOURCE_EVENT_ID_REQUIRED'] };
    }

    const accepted = this.store.acceptEvent(source, preliminary.sourceEventId, rawPayload, now);
    if (accepted.duplicate) {
      return {
        accepted: true, duplicate: true, status: 'DUPLICATE',
        eventId: accepted.event.id, dealId: accepted.event.dealId ?? null,
      };
    }

    const eventRecord = accepted.event;
    const validation = validateLeadEvent(preliminary);
    if (!validation.valid) {
      this.store.setEventStatus(eventRecord, 'REJECTED', { errors: validation.errors });
      return { accepted: true, duplicate: false, status: 'REJECTED', eventId: eventRecord.id, errors: validation.errors };
    }
    this.store.setEventStatus(eventRecord, 'VALIDATED');

    const matches = this.store.findContactMatches(
      preliminary.lead.emailNormalized,
      preliminary.lead.phoneNormalized,
    );
    if (matches.byEmail && matches.byPhone && matches.byEmail.id !== matches.byPhone.id) {
      this.store.setEventStatus(eventRecord, 'MANUAL_REVIEW', { reason: 'IDENTITY_CONFLICT' });
      return { accepted: true, status: 'MANUAL_REVIEW', eventId: eventRecord.id, reason: 'IDENTITY_CONFLICT' };
    }

    const contact = this.store.upsertContact(preliminary.lead, {
      emailHash: stableHash(preliminary.lead.emailNormalized),
      phoneHash: stableHash(preliminary.lead.phoneNormalized),
    }, now);
    this.store.touchpoints.push({
      id: this.store.nextId('touch'), contactId: contact.id, eventId: eventRecord.id,
      source, attribution: preliminary.attribution, message: preliminary.lead.message,
      occurredAt: preliminary.occurredAt,
    });

    let deal = this.store.findOpenDeal(
      contact.id, preliminary.lead.service, now, this.config.dealDedupeWindowDays,
    );
    const existingDeal = Boolean(deal);
    if (!deal) deal = this.store.createDeal(contact.id, preliminary.lead.service, now);
    eventRecord.contactId = contact.id;
    eventRecord.dealId = deal.id;

    const scoreResult = scoreLead(preliminary, this.config);
    Object.assign(deal, {
      score: scoreResult.score, leadClass: scoreResult.leadClass,
      scoreRuleVersion: scoreResult.ruleVersion, updatedAt: now.toISOString(),
    });
    this.store.scoreResults.push({ id: this.store.nextId('score'), dealId: deal.id, ...scoreResult, createdAt: now.toISOString() });
    this.store.setEventStatus(eventRecord, 'QUALIFIED', { score: scoreResult.score, leadClass: scoreResult.leadClass });

    let owner = this.store.owners.get(deal.ownerId);
    if (!owner || !owner.active) {
      ({ owner } = routeLead(this.store, preliminary, deal, {
        fallbackOwnerId: this.config.fallbackOwnerId, now,
      }));
    }
    this.store.setEventStatus(eventRecord, 'ROUTED', { ownerId: owner.id });

    const summary = await this.ai.summarize(preliminary, scoreResult, fallbackSummary)
      .catch(() => ({ text: fallbackSummary(preliminary, scoreResult), provider: 'deterministic-fallback' }));
    deal.summary = summary.text;
    deal.summaryProvider = summary.provider;

    try {
      const crmContact = await this.callCrm(eventRecord.id, 'upsertContact', () => this.crm.upsertContact(contact), now);
      const crmDeal = await this.callCrm(eventRecord.id, 'upsertDeal', () => this.crm.upsertDeal(deal, crmContact), now);
      contact.crmContactId = crmContact.id;
      deal.crmDealId = crmDeal.id;
      deal.crmUrl = crmDeal.url;
      deal.lastCrmSyncAt = now.toISOString();
      this.store.setEventStatus(eventRecord, 'SYNCED', { crmDealId: crmDeal.id });
    } catch (error) {
      const step = this.crm.calls.at(-1)?.operation ?? 'crmSync';
      this.createFailedEvent(eventRecord, step, error, now);
      this.store.setEventStatus(eventRecord, 'FAILED', { errorCode: error.code ?? 'INTEGRATION_ERROR' });
      return { accepted: true, status: 'FAILED', eventId: eventRecord.id, dealId: deal.id };
    }

    const sla = DEFAULT_SLA_MS[scoreResult.leadClass];
    const scale = this.config.slaTimeScale;
    const reminderAt = new Date(now.getTime() + sla.reminder * scale);
    const escalationAt = new Date(now.getTime() + sla.escalation * scale);
    const notification = await this.notifications.send({
      type: 'NEW_LEAD', recipient: owner.notificationTarget,
      idempotencyKey: `${deal.id}:NEW_LEAD:${owner.id}`,
      text: safeNotificationText({ contact, event: preliminary, deal, scoreResult, summary, owner, deadline: reminderAt }),
      metadata: { eventId: eventRecord.id, dealId: deal.id }, now,
    });

    if (!existingDeal) {
      for (const [type, dueAt] of [['REMINDER', reminderAt], ['ESCALATION', escalationAt]]) {
        this.store.slaCheckpoints.push({
          id: this.store.nextId('sla'), dealId: deal.id, type,
          dueAt: dueAt.toISOString(), completedAt: null, status: 'PENDING', scheduleVersion: '2026-09-04.1',
        });
      }
    }
    this.store.setEventStatus(eventRecord, 'NOTIFIED', { duplicateNotification: notification.duplicate });

    return {
      accepted: true, duplicate: false, status: 'NOTIFIED', eventId: eventRecord.id,
      contactId: contact.id, dealId: deal.id, ownerId: owner.id,
      score: scoreResult.score, leadClass: scoreResult.leadClass,
      crmUrl: deal.crmUrl, notificationPreview: notification.action.text,
    };
  }

  async replayFailed(eventId, now = this.now()) {
    const event = this.store.events.get(eventId);
    if (!event) throw new Error('EVENT_NOT_FOUND');
    const failed = [...this.store.failedEvents.values()].find((entry) => entry.eventId === eventId && entry.resolutionStatus === 'OPEN');
    if (!failed) throw new Error('OPEN_FAILED_EVENT_NOT_FOUND');

    const contact = this.store.contacts.get(event.contactId);
    const deal = this.store.deals.get(event.dealId);
    const owner = deal && this.store.owners.get(deal.ownerId);
    if (!contact || !deal || !owner) throw new Error('FAILED_EVENT_STATE_INCOMPLETE');

    const canonical = adaptLeadEvent(event.source, event.rawPayload, {
      now, defaultCountryCode: this.config.defaultCountryCode,
      plusTagDomains: this.config.plusTagDomains,
    });
    const scoreResult = scoreLead(canonical, this.config);
    const summary = {
      text: deal.summary ?? fallbackSummary(canonical, scoreResult),
      provider: deal.summaryProvider ?? 'deterministic-fallback',
    };
    failed.resolutionStatus = 'RETRYING';
    failed.updatedAt = now.toISOString();
    this.store.setEventStatus(event, 'ROUTED', { replay: true, failedStep: failed.step });

    try {
      const crmContact = await this.callCrm(event.id, 'upsertContact', () => this.crm.upsertContact(contact), now);
      const crmDeal = await this.callCrm(event.id, 'upsertDeal', () => this.crm.upsertDeal(deal, crmContact), now);
      contact.crmContactId = crmContact.id;
      deal.crmDealId = crmDeal.id;
      deal.crmUrl = crmDeal.url;
      deal.lastCrmSyncAt = now.toISOString();
      this.store.setEventStatus(event, 'SYNCED', { crmDealId: crmDeal.id, replay: true });

      const sla = DEFAULT_SLA_MS[scoreResult.leadClass];
      const reminderAt = new Date(now.getTime() + sla.reminder * this.config.slaTimeScale);
      const escalationAt = new Date(now.getTime() + sla.escalation * this.config.slaTimeScale);
      await this.notifications.send({
        type: 'NEW_LEAD', recipient: owner.notificationTarget,
        idempotencyKey: `${deal.id}:NEW_LEAD:${owner.id}`,
        text: safeNotificationText({ contact, event: canonical, deal, scoreResult, summary, owner, deadline: reminderAt }),
        metadata: { eventId: event.id, dealId: deal.id, replay: true }, now,
      });
      if (!this.store.slaCheckpoints.some((checkpoint) => checkpoint.dealId === deal.id)) {
        for (const [type, dueAt] of [['REMINDER', reminderAt], ['ESCALATION', escalationAt]]) {
          this.store.slaCheckpoints.push({
            id: this.store.nextId('sla'), dealId: deal.id, type,
            dueAt: dueAt.toISOString(), completedAt: null, status: 'PENDING', scheduleVersion: '2026-09-04.1',
          });
        }
      }
      failed.resolutionStatus = 'RESOLVED';
      failed.updatedAt = now.toISOString();
      this.store.setEventStatus(event, 'NOTIFIED', { replay: true });
      return {
        accepted: true, duplicate: false, status: 'NOTIFIED', eventId: event.id,
        contactId: contact.id, dealId: deal.id, ownerId: owner.id,
        score: scoreResult.score, leadClass: scoreResult.leadClass, crmUrl: deal.crmUrl,
      };
    } catch (error) {
      failed.resolutionStatus = 'OPEN';
      failed.attempts += error.attempts?.length ?? 1;
      failed.updatedAt = now.toISOString();
      this.store.setEventStatus(event, 'FAILED', { replay: true, errorCode: error.code ?? 'INTEGRATION_ERROR' });
      return { accepted: true, status: 'FAILED', eventId: event.id, dealId: deal.id };
    }
  }

  markDealStage(dealId, stage, now = this.now(), actor = 'manager') {
    const deal = this.store.deals.get(dealId);
    if (!deal) throw new Error('DEAL_NOT_FOUND');
    deal.stage = stage;
    deal.updatedAt = now.toISOString();
    if (['IN_PROGRESS', 'QUALIFIED_OPPORTUNITY', 'NURTURE', 'DISQUALIFIED'].includes(stage)) {
      deal.firstActionAt ??= now.toISOString();
      for (const checkpoint of this.store.slaCheckpoints.filter((item) => item.dealId === dealId && item.status === 'PENDING')) {
        checkpoint.status = 'CANCELLED';
        checkpoint.completedAt = now.toISOString();
      }
    }
    this.store.appendAudit('deal', dealId, `STAGE_${stage}`, {}, actor);
    return deal;
  }

  scheduleNurture(dealId, dueAt, now = this.now()) {
    const deal = this.store.deals.get(dealId);
    const contact = deal && this.store.contacts.get(deal.contactId);
    if (!deal || !contact) throw new Error('DEAL_NOT_FOUND');
    if (!contact.consent) return { scheduled: false, reason: 'CONSENT_REQUIRED' };
    this.markDealStage(dealId, 'NURTURE', now);
    const saved = this.store.saveOutbound({
      type: 'NURTURE', recipient: contact.emailHash ?? contact.phoneHash,
      idempotencyKey: `${dealId}:NURTURE:${new Date(dueAt).toISOString()}`,
      text: 'Nurture message preview', status: 'SCHEDULED',
      createdAt: now.toISOString(), dueAt: new Date(dueAt).toISOString(),
    });
    return { scheduled: !saved.duplicate, action: saved.action };
  }

  async runSla(now = this.now()) {
    const delivered = [];
    for (const checkpoint of this.store.slaCheckpoints) {
      if (checkpoint.status !== 'PENDING' || Date.parse(checkpoint.dueAt) > now.getTime()) continue;
      const deal = this.store.deals.get(checkpoint.dealId);
      if (!deal || deal.firstActionAt) {
        checkpoint.status = 'CANCELLED';
        checkpoint.completedAt = now.toISOString();
        continue;
      }
      const owner = this.store.owners.get(deal.ownerId) ?? this.store.owners.get(this.config.fallbackOwnerId);
      const recipient = checkpoint.type === 'ESCALATION'
        ? (this.config.salesLeadNotificationTarget ?? '#sales-leads')
        : owner.notificationTarget;
      const sent = await this.notifications.send({
        type: `SLA_${checkpoint.type}`, recipient,
        idempotencyKey: `${deal.id}:SLA:${checkpoint.type}:${checkpoint.scheduleVersion}`,
        text: `${checkpoint.type}: lead ${deal.id} has no first sales action. CRM: ${deal.crmUrl}`,
        metadata: { dealId: deal.id, checkpointId: checkpoint.id }, now,
      });
      checkpoint.status = 'DELIVERED';
      checkpoint.completedAt = now.toISOString();
      if (checkpoint.type === 'ESCALATION') deal.stage = 'SLA_BREACHED';
      delivered.push(sent.action);
    }
    return delivered;
  }
}
