const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'mail.com',
]);

function emailDomain(email) {
  return email?.split('@')[1] ?? null;
}

export function scoreLead(event, config = {}) {
  const servedTerritories = new Set(config.servedTerritories ?? ['US-WEST', 'US-EAST', 'UK']);
  const targetServices = new Set(config.targetServices ?? ['crm_automation']);
  const highIntentSources = new Set(config.highIntentSources ?? ['website', 'calendly']);
  const factors = [];
  let score = 0;

  const add = (code, points, reason) => {
    score += points;
    factors.push({ code, points, reason });
  };

  const domain = emailDomain(event.lead.emailNormalized);
  if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) add('CORPORATE_EMAIL', 15, 'Corporate email supplied');
  if (event.lead.company) add('COMPANY_PRESENT', 10, 'Company supplied');
  if (targetServices.has(event.lead.service)) add('TARGET_SERVICE', 25, 'Requested a target service');
  if (servedTerritories.has(event.lead.territory)) add('SERVED_TERRITORY', 15, 'Territory is served');
  if (event.lead.message && event.lead.message.length >= 25) add('SPECIFIC_NEED', 15, 'Message contains a specific business need');
  if (highIntentSources.has(event.source)) add('HIGH_INTENT_SOURCE', 10, 'High-intent source');
  if (event.lead.emailNormalized && event.lead.phoneNormalized) add('TWO_CONTACT_METHODS', 10, 'Email and phone supplied');
  if (event.lead.territory && !servedTerritories.has(event.lead.territory)) add('UNSERVED_TERRITORY', -30, 'Territory is not served');
  if (!event.lead.consent) add('NO_FOLLOWUP_CONSENT', -20, 'No consent for follow-up');

  score = Math.max(0, Math.min(100, score));
  const leadClass = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';
  return { score, leadClass, factors, ruleVersion: '2026-09-04.1' };
}

export function fallbackSummary(event, scoreResult) {
  const name = [event.lead.firstName, event.lead.lastName].filter(Boolean).join(' ') || 'Unknown lead';
  const positives = scoreResult.factors.filter((factor) => factor.points > 0).map((factor) => factor.reason);
  return `${name} is ${scoreResult.leadClass} (${scoreResult.score}/100). ${positives.slice(0, 3).join('; ') || 'No positive scoring factors.'}`;
}
