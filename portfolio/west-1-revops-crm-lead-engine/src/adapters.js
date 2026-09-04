export class IntegrationError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'IntegrationError';
    this.code = options.code ?? 'INTEGRATION_ERROR';
    this.statusCode = options.statusCode ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.retryable = options.retryable;
  }
}

export class MockCrmAdapter {
  constructor(options = {}) {
    this.failurePlan = [...(options.failurePlan ?? [])];
    this.contacts = new Map();
    this.deals = new Map();
    this.calls = [];
  }

  maybeFail(operation) {
    const planned = this.failurePlan.shift();
    if (!planned) return;
    this.calls.push({ operation, failed: true, ...planned });
    throw new IntegrationError(planned.message ?? `Mock HTTP ${planned.statusCode}`, planned);
  }

  async upsertContact(contact) {
    this.maybeFail('upsertContact');
    const id = this.contacts.get(contact.id)?.id ?? `mock-contact-${contact.id}`;
    const result = { id, url: `https://mock-crm.local/contacts/${id}` };
    this.contacts.set(contact.id, result);
    this.calls.push({ operation: 'upsertContact', failed: false, externalKey: contact.id });
    return result;
  }

  async upsertDeal(deal, contactResult) {
    this.maybeFail('upsertDeal');
    const id = this.deals.get(deal.id)?.id ?? `mock-deal-${deal.id}`;
    const result = {
      id, contactId: contactResult.id, url: `https://mock-crm.local/deals/${id}`,
    };
    this.deals.set(deal.id, result);
    this.calls.push({ operation: 'upsertDeal', failed: false, externalKey: deal.id });
    return result;
  }
}

export class PreviewNotificationAdapter {
  constructor(store) {
    this.store = store;
  }

  async send({ type, recipient, text, idempotencyKey, metadata = {}, now = new Date() }) {
    return this.store.saveOutbound({
      type, recipient, text, idempotencyKey, metadata,
      status: 'PREVIEWED', createdAt: now.toISOString(),
    });
  }
}

export class FallbackAiAdapter {
  async summarize(event, scoreResult, fallback) {
    return { text: fallback(event, scoreResult), provider: 'deterministic-fallback' };
  }
}
