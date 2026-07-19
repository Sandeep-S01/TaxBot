import dotenv from 'dotenv';

dotenv.config();

const baseUrl = (process.env.SMOKE_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const email = process.env.SMOKE_CA_EMAIL;
const password = process.env.SMOKE_CA_PASSWORD;

type SmokeResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const results: SmokeResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${detail}`);
}

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, init);
}

async function requestJson(path: string, init: RequestInit = {}) {
  const res = await request(path, init);
  let body: any = null;

  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return { res, body };
}

async function run() {
  console.log(`Production smoke target: ${baseUrl}`);

  try {
    const health = await request('/health');
    record('health', health.ok, `status ${health.status}`);
  } catch (err: any) {
    record('health', false, err.message);
  }

  if (!email || !password) {
    record('ca login', false, 'SMOKE_CA_EMAIL and SMOKE_CA_PASSWORD are required');
    finish();
    return;
  }

  const login = await requestJson('/api/ca/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const token = login.body?.token;
  record('ca login', login.res.ok && Boolean(token), `status ${login.res.status}`);

  if (!token) {
    finish();
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  const clientsResp = await requestJson('/api/ca/clients', { headers: authHeaders });
  const clients = Array.isArray(clientsResp.body) ? clientsResp.body : [];
  record('ca clients', clientsResp.res.ok, `status ${clientsResp.res.status}, ${clients.length} client(s)`);

  const firstClient = clients[0];
  if (!firstClient?.id) {
    record('client scoped checks', true, 'skipped because this CA has no linked clients');
    finish();
    return;
  }

  const txResp = await requestJson(`/api/ca/clients/${firstClient.id}/transactions`, { headers: authHeaders });
  const txs = Array.isArray(txResp.body?.transactions) ? txResp.body.transactions : [];
  record('client transactions', txResp.res.ok, `status ${txResp.res.status}, ${txs.length} transaction(s)`);

  const reconResp = await requestJson(`/api/ca/clients/${firstClient.id}/reconciliation`, { headers: authHeaders });
  record('bank reconciliation', reconResp.res.ok, `status ${reconResp.res.status}`);

  const pdfResp = await request(`/api/ca/reports/pdf?clientId=${encodeURIComponent(firstClient.id)}&reportType=gst`, {
    headers: authHeaders,
  });
  const pdfType = pdfResp.headers.get('content-type') || '';
  record('authenticated pdf report', pdfResp.ok && pdfType.includes('application/pdf'), `status ${pdfResp.status}, content-type ${pdfType || 'missing'}`);

  const exportResp = await request(`/export/${encodeURIComponent(firstClient.id)}?format=csv`);
  record('public csv export route', exportResp.ok, `status ${exportResp.status}`);

  const firstTx = txs[0];
  if (firstTx?.id) {
    const payResp = await request(`/pay/${encodeURIComponent(firstTx.id)}`);
    record('raw payment page blocked', payResp.status === 403, `status ${payResp.status}`);
  } else {
    record('raw payment page blocked', true, 'skipped because no transaction id is available');
  }

  finish();
}

function finish() {
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(`\nSmoke test failed: ${failed.length} check(s) failed.`);
    process.exit(1);
  }

  console.log('\nSmoke test passed.');
}

run().catch((err) => {
  console.error('Smoke test crashed:', err.message);
  process.exit(1);
});
