export function routeLead(store, event, deal, config = {}) {
  const candidates = [...store.owners.values()]
    .filter((owner) => owner.active)
    .filter((owner) => owner.territories.includes(event.lead.territory))
    .filter((owner) => owner.services.includes(event.lead.service))
    .filter((owner) => owner.activeLeadCount < owner.capacity)
    .sort((a, b) => a.id.localeCompare(b.id));

  let owner;
  let reason;
  if (candidates.length === 0) {
    owner = store.owners.get(config.fallbackOwnerId ?? 'owner-fallback');
    if (!owner) throw new Error('FALLBACK_OWNER_NOT_CONFIGURED');
    reason = 'FALLBACK_NO_ELIGIBLE_OWNER';
  } else {
    const key = `${event.lead.territory}:${event.lead.service}`;
    const cursor = store.routingCursor.get(key) ?? 0;
    owner = candidates[cursor % candidates.length];
    store.routingCursor.set(key, (cursor + 1) % candidates.length);
    reason = 'TERRITORY_SERVICE_CAPACITY_ROUND_ROBIN';
  }

  owner.activeLeadCount += 1;
  deal.ownerId = owner.id;
  const assignment = {
    id: store.nextId('assignment'), dealId: deal.id, ownerId: owner.id,
    reason, ruleVersion: '2026-09-04.1', createdAt: config.now.toISOString(),
  };
  store.routingAssignments.push(assignment);
  store.appendAudit('deal', deal.id, 'ROUTED', { ownerId: owner.id, reason });
  return { owner, assignment };
}
