const form = document.querySelector('#lead-form');
const output = document.querySelector('#form-result');

async function refreshState() {
  const response = await fetch('/api/state');
  if (!response.ok) return;
  const state = await response.json();
  document.querySelector('#contact-count').textContent = state.counts.contacts;
  document.querySelector('#deal-count').textContent = state.counts.deals;
  document.querySelector('#event-count').textContent = state.counts.events;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  const values = new FormData(form);
  button.disabled = true;
  output.textContent = 'Processing…';

  const payload = {
    event_type: 'lead.submitted',
    occurred_at: new Date().toISOString(),
    source_event_id: `web_${Date.now()}`,
    lead: {
      first_name: values.get('first_name'),
      last_name: values.get('last_name'),
      email: values.get('email'),
      phone: values.get('phone'),
      company: values.get('company'),
      territory: values.get('territory'),
      service: 'crm_automation',
      message: values.get('message'),
      consent: values.get('consent') === 'on',
    },
    attribution: {
      utm_source: 'portfolio_demo', utm_medium: 'interactive',
      utm_campaign: 'west_1_case_study', landing_page: '/',
    },
  };

  try {
    const response = await fetch('/api/leads/website', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    output.textContent = JSON.stringify(result, null, 2);
    await refreshState();
  } catch {
    output.textContent = 'The local demo server is unavailable. Run: npm run serve:demo';
  } finally {
    button.disabled = false;
  }
});

refreshState().catch(() => {
  output.textContent = 'Run npm run serve:demo to activate the interactive form.';
});
