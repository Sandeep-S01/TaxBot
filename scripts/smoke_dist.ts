import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';

const DIST_ENTRY = path.join(process.cwd(), 'dist', 'index.js');

function longSecret(label: string): string {
  return `${label}_abcdefghijklmnopqrstuvwxyz_1234567890`;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate local smoke-test port')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForEndpoint(url: string, timeoutMs = 15000): Promise<Response> {
  const startedAt = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      return response;
    } catch (err: any) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function stopServer(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

async function run() {
  if (!fs.existsSync(DIST_ENTRY)) {
    console.error('Compiled server entry not found. Run npm run build before npm run smoke:dist.');
    process.exit(1);
  }

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const configuredOrigin = `http://taxbot-dist-smoke.localhost:${port}`;
  const child = spawn(process.execPath, [DIST_ENTRY], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      SUPABASE_URL: 'https://taxbot-dist-smoke-project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: longSecret('service_role_key'),
      JWT_SECRET: longSecret('jwt_secret'),
      EXPORT_TOKEN_SECRET: longSecret('export_token_secret'),
      META_APP_SECRET: longSecret('meta_app_secret'),
      EMAIL_WEBHOOK_SECRET: longSecret('email_webhook_secret'),
      APP_ORIGIN: configuredOrigin,
      ALLOWED_ORIGINS: baseUrl,
      GEMINI_API_KEY: 'test_gemini_key',
      ANTHROPIC_API_KEY: longSecret('anthropic_api_key'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const health = await waitForEndpoint(`${baseUrl}/health`);
    if (!health.ok) {
      throw new Error(`/health returned ${health.status}`);
    }
    const healthBody = await health.json() as any;
    if (healthBody?.service !== 'TaxBot API' || !healthBody?.version) {
      throw new Error('/health returned unexpected deployment metadata');
    }

    const version = await fetch(`${baseUrl}/version`);
    const versionBody = await version.json() as any;
    if (!version.ok || versionBody?.service !== 'TaxBot API') {
      throw new Error(`/version returned ${version.status} with unexpected body`);
    }

    const ready = await fetch(`${baseUrl}/ready`);
    if (ready.status === 404) {
      throw new Error('/ready returned 404 from compiled server');
    }
    try {
      const readyBody = await ready.json() as any;
      if (!['ready', 'not_ready'].includes(readyBody?.status)) {
        throw new Error('/ready returned an unexpected JSON status');
      }
    } catch (err: any) {
      throw new Error(`/ready did not return expected JSON: ${err.message}`);
    }

    console.log(`Compiled dist smoke passed on ${baseUrl}. /ready status ${ready.status}.`);
  } catch (err: any) {
    console.error('Compiled dist smoke failed:', err.message);
    if (stdout.trim()) {
      console.error('Server stdout:');
      console.error(stdout.trim());
    }
    if (stderr.trim()) {
      console.error('Server stderr:');
      console.error(stderr.trim());
    }
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

run().catch((err) => {
  console.error('Compiled dist smoke crashed:', err.message);
  process.exit(1);
});
