import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { exportToTallyXML } from '../src/utils/exporter';
import { allowRawDebugOutput, logProviderError, safeIdentifier } from './dev_logging';

dotenv.config();

interface SyncConfig {
  clientId: string;
  lastSyncTime: string;
  tallyPort: number;
  serverUrl: string;
  caEmail?: string;
}

const CONFIG_FILE = path.join(process.cwd(), 'sync_config.json');

const DEFAULT_CONFIG: SyncConfig = {
  clientId: 'PLACEHOLDER_CLIENT_ID',
  lastSyncTime: new Date(0).toISOString(),
  tallyPort: 9000,
  serverUrl: 'http://localhost:3000',
  caEmail: 'ca@example.com',
};

async function loadConfig(): Promise<SyncConfig> {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log(`[Sync] Config file not found. Creating default at: ${CONFIG_FILE}`);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    console.log(`[Sync] Set clientId and caEmail in sync_config.json, then provide TAXBOT_CA_PASSWORD or TAXBOT_CA_TOKEN in your environment.`);
    process.exit(0);
  }

  const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
  return JSON.parse(raw);
}

async function saveConfig(config: SyncConfig): Promise<void> {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

async function getAuthToken(config: SyncConfig): Promise<string> {
  const envToken = process.env.TAXBOT_CA_TOKEN || process.env.SMOKE_CA_TOKEN;
  if (envToken) {
    return envToken;
  }

  const email = process.env.TAXBOT_CA_EMAIL || config.caEmail;
  const password = process.env.TAXBOT_CA_PASSWORD;
  if (!email || !password || email === DEFAULT_CONFIG.caEmail) {
    throw new Error('Set TAXBOT_CA_TOKEN, or set TAXBOT_CA_EMAIL/TAXBOT_CA_PASSWORD before running sync.');
  }

  const loginUrl = `${config.serverUrl.replace(/\/$/, '')}/api/ca/login`;
  const response = await axios.post(
    loginUrl,
    { email, password },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    }
  );

  const token = response.data?.token;
  if (!token) {
    throw new Error('TaxBot login succeeded but did not return a token.');
  }
  return token;
}

async function syncWithTally() {
  const config = await loadConfig();

  if (config.clientId === DEFAULT_CONFIG.clientId) {
    console.error(`[Sync Error] Set your actual clientId in sync_config.json.`);
    process.exit(1);
  }

  console.log(`[Sync] Starting synchronization for client: ${safeIdentifier(config.clientId, 'client')}`);
  console.log(`[Sync] Querying transactions since: ${config.lastSyncTime}`);

  try {
    const authToken = await getAuthToken(config);

    const syncUrl = `${config.serverUrl.replace(/\/$/, '')}/api/sync/${config.clientId}?since=${encodeURIComponent(config.lastSyncTime)}`;
    const response = await axios.get(syncUrl, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      timeout: 10000,
    });

    const { transactions, count, businessName, gstin, lastSyncTime } = response.data;
    console.log(`[Sync] Fetched ${count} new transactions from server.`);

    if (count === 0) {
      console.log(`[Sync] Ledger is already up to date. No new vouchers to sync.`);
      config.lastSyncTime = lastSyncTime;
      await saveConfig(config);
      return;
    }

    console.log(`[Sync] Generating compliant Tally XML split-vouchers for configured client...`);
    const xmlData = exportToTallyXML(transactions, businessName, gstin);

    const tallyUrl = `http://localhost:${config.tallyPort}`;
    console.log(`[Sync] Connecting to local Tally Prime at: ${tallyUrl}`);

    const tallyResponse = await axios.post(tallyUrl, xmlData, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
      timeout: 10000,
    });

    const responseText = tallyResponse.data as string;
    console.log(`[Sync] Tally response received.`);
    if (allowRawDebugOutput()) {
      console.log(responseText);
    }

    const createdMatch = responseText.match(/<CREATED>(\d+)<\/CREATED>/);
    const alteredMatch = responseText.match(/<ALTERED>(\d+)<\/ALTERED>/);
    const errorsMatch = responseText.match(/<ERRORS>(\d+)<\/ERRORS>/);

    const created = createdMatch ? parseInt(createdMatch[1], 10) : 0;
    const altered = alteredMatch ? parseInt(alteredMatch[1], 10) : 0;
    const errors = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;

    console.log(`\nSync Results:`);
    console.log(`- Vouchers Created: ${created}`);
    console.log(`- Vouchers Altered: ${altered}`);
    console.log(`- Import Errors: ${errors}`);

    if (errors > 0) {
      console.warn(`[Sync Warning] Tally reported ${errors} errors during import. Check Tally's Tally.imp log file for details.`);

      const lineErrorMatch = responseText.match(/<LINEERROR>(.*?)<\/LINEERROR>/g);
      if (lineErrorMatch && allowRawDebugOutput()) {
        console.warn(`Error Details:`);
        lineErrorMatch.forEach((errLine) => {
          console.warn(`  - ${errLine.replace(/<\/?LINEERROR>/g, '')}`);
        });
      } else if (lineErrorMatch) {
        console.warn(`Line-level Tally errors are hidden. Set ALLOW_RAW_DEBUG_OUTPUT=true to show local Tally details.`);
      }
    } else {
      console.log(`[Sync Success] All ${count} transactions imported successfully into Tally.`);
      config.lastSyncTime = lastSyncTime;
      await saveConfig(config);
      console.log(`[Sync] Config file updated. Next sync starts from: ${config.lastSyncTime}`);
    }
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED') {
      console.error(`\n[Sync Connection Error] Could not connect to Tally on port ${config.tallyPort}.`);
      console.error(`Ensure Tally is running locally and HTTP Server is enabled:`);
      console.error(`  Gateway of Tally > Press F12 > Advanced Configuration > Enable ODBC/HTTP Server -> Yes, Port -> ${config.tallyPort}\n`);
    } else {
      logProviderError(`\n[Sync Error]`, 'unknown', 'tally_sync', err);
    }
    process.exit(1);
  }
}

syncWithTally();
