import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { InMemoryLeadStore } from './store.js';
import { LeadEngine } from './pipeline.js';

const projectRoot = new URL('../', import.meta.url);
const dashboardRoot = new URL('dashboard/', projectRoot);
const owners = JSON.parse(await readFile(new URL('fixtures/owners.json', projectRoot), 'utf8'));

const STATIC_ROUTES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request, maxBytes = 65_536) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) {
      const error = new Error('REQUEST_BODY_TOO_LARGE');
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    const error = new Error('INVALID_JSON');
    error.statusCode = 400;
    throw error;
  }
}

function safeState(store) {
  const snapshot = store.snapshot();
  return {
    counts: {
      events: snapshot.events.length,
      contacts: snapshot.contacts.length,
      deals: snapshot.deals.length,
      outboundActions: snapshot.outboundActions.length,
      failedEvents: snapshot.failedEvents.length,
    },
    latestEvents: snapshot.events.slice(-5).reverse().map((event) => ({
      eventId: event.id, source: event.source, sourceEventId: event.sourceEventId,
      status: event.status, dealId: event.dealId ?? null, acceptedAt: event.acceptedAt,
    })),
  };
}

export async function createDemoServer(options = {}) {
  const store = options.store ?? new InMemoryLeadStore({ owners: structuredClone(owners) });
  const engine = options.engine ?? new LeadEngine({ store });

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && STATIC_ROUTES.has(url.pathname)) {
        const [fileName, contentType] = STATIC_ROUTES.get(url.pathname);
        const content = await readFile(new URL(fileName, dashboardRoot));
        response.writeHead(200, {
          'content-type': contentType,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'",
        });
        response.end(content);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/state') {
        jsonResponse(response, 200, safeState(store));
        return;
      }

      const source = url.pathname === '/api/leads/website'
        ? 'website'
        : url.pathname === '/api/leads/meta' ? 'meta' : null;
      if (request.method === 'POST' && source) {
        const payload = await readJsonBody(request);
        const result = await engine.process(source, payload);
        jsonResponse(response, result.accepted ? 202 : 400, result);
        return;
      }

      jsonResponse(response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      jsonResponse(response, error.statusCode ?? 500, {
        error: error.statusCode ? error.message : 'INTERNAL_ERROR',
      });
    }
  });

  return { server, store, engine };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.DEMO_PORT ?? 8080);
  const host = '127.0.0.1';
  const { server } = await createDemoServer();
  server.listen(port, host, () => {
    console.log(`WEST 1 demo: http://${host}:${port}`);
    console.log('Synthetic data only. No external CRM or Slack calls.');
  });
}
