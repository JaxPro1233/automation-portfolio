# Acceptance criteria

- Website and enriched Meta fixtures map to one canonical contract.
- Re-importing the same source event creates no second event, contact, deal, assignment or notification.
- Email-only and phone-only leads are supported.
- Phone formatting variants resolve to one contact.
- Conflicting email/phone matches go to manual review.
- Scoring is deterministic, versioned and independent of AI availability.
- Routing applies active, territory, service and capacity filters before round-robin.
- Missing eligible manager uses the configured fallback owner.
- CRM sync completes before notification.
- HTTP 429 honors `Retry-After`; 408/5xx use bounded retry; permanent 4xx fails immediately.
- Exhausted failures create an operator-visible failed event.
- Replay completes without duplicate business records or notifications.
- SLA emits at most one reminder and one escalation per schedule version.
- Manager action cancels pending SLA checkpoints.
- No-consent leads cannot schedule nurture output.
- Logs, exports and preview messages contain no secrets or open contact details.
- The n8n workflow remains unpublished and credential-free by default.
- `npm test`, `npm run check` and `npm run demo` succeed.

## Demo script

1. Run `npm test`.
2. Run `npm run demo`.
3. Show the first HOT lead, owner, mock CRM link and Slack preview.
4. Show that duplicate replay changes no control total.
5. Show the failed `429` attempt followed by success.
6. Show compressed SLA reminder and escalation.
7. Open the dashboard and explain the trace timeline.
