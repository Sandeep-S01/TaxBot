import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { exportToTallyXML } from '../src/utils/exporter';

dotenv.config();

interface SyncConfig {
  clientId: string;
  caId: string;
  lastSyncTime: string;
  tallyPort: number;
  serverUrl: string;
}

const CONFIG_FILE = path.join(process.cwd(), 'sync_config.json');

// Default config if none exists
const DEFAULT_CONFIG: SyncConfig = {
  clientId: 'PLACEHOLDER_CLIENT_ID',
  caId: 'PLACEHOLDER_CA_ID',
  lastSyncTime: new Date(0).toISOString(), // 1970-01-01
  tallyPort: 9000,
  serverUrl: 'http://localhost:3000',
};

async function loadConfig(): Promise<SyncConfig> {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log(`[Sync] Config file not found. Creating default at: ${CONFIG_FILE}`);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    console.log(`[Sync] Please configure 'sync_config.json' with your actual clientId and caId before running sync.`);
    process.exit(0);
  }

  const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
  return JSON.parse(raw);
}

async function saveConfig(config: SyncConfig): Promise<void> {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

async function syncWithTally() {
  const config = await loadConfig();

  if (config.clientId === 'PLACEHOLDER_CLIENT_ID' || config.caId === 'PLACEHOLDER_CA_ID') {
    console.error(`[Sync Error] Please set your actual 'clientId' and 'caId' in 'sync_config.json'.`);
    process.exit(1);
  }

  console.log(`[Sync] Starting synchronization for client: ${config.clientId}`);
  console.log(`[Sync] Querying transactions since: ${config.lastSyncTime}`);

  try {
    // 1. Fetch transactions from TaxBot server
    const syncUrl = `${config.serverUrl}/api/sync/${config.clientId}?since=${encodeURIComponent(config.lastSyncTime)}`;
    const response = await axios.get(syncUrl, {
      headers: {
        'x-ca-id': config.caId,
      },
    });

    const { transactions, count, businessName, gstin, lastSyncTime } = response.data;

    console.log(`[Sync] Fetched ${count} new transactions from server.`);

    if (count === 0) {
      console.log(`[Sync] Ledger is already up to date. No new vouchers to sync.`);
      // Update sync time to the one provided by server
      config.lastSyncTime = lastSyncTime;
      await saveConfig(config);
      return;
    }

    // 2. Generate Tally XML format
    console.log(`[Sync] Generating compliant Tally XML split-vouchers for ${businessName}...`);
    const xmlData = exportToTallyXML(transactions, businessName, gstin);

    // 3. Post XML data to local Tally instance
    const tallyUrl = `http://localhost:${config.tallyPort}`;
    console.log(`[Sync] Connecting to local Tally Prime at: ${tallyUrl}`);

    const tallyResponse = await axios.post(tallyUrl, xmlData, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
      timeout: 10000, // 10s timeout
    });

    const responseText = tallyResponse.data as string;
    console.log(`[Sync] Tally response received:`);
    console.log(responseText);

    // 4. Parse Tally Response for errors/creates
    const createdMatch = responseText.match(/<CREATED>(\d+)<\/CREATED>/);
    const alteredMatch = responseText.match(/<ALTERED>(\d+)<\/ALTERED>/);
    const errorsMatch = responseText.match(/<ERRORS>(\d+)<\/ERRORS>/);

    const created = createdMatch ? parseInt(createdMatch[1], 10) : 0;
    const altered = alteredMatch ? parseInt(alteredMatch[1], 10) : 0;
    const errors = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;

    console.log(`\n📊 *Sync Results:*`);
    console.log(`• Vouchers Created: ${created}`);
    console.log(`• Vouchers Altered: ${altered}`);
    console.log(`• Import Errors: ${errors}`);

    if (errors > 0) {
      console.warn(`[Sync Warning] Tally reported ${errors} errors during import. Check Tally's 'Tally.imp' log file for details.`);
      
      // Look for error details in description if any
      const lineErrorMatch = responseText.match(/<LINEERROR>(.*?)<\/LINEERROR>/g);
      if (lineErrorMatch) {
        console.warn(`Error Details:`);
        lineErrorMatch.forEach((errLine) => {
          console.warn(`  - ${errLine.replace(/<\/?LINEERROR>/g, '')}`);
        });
      }
    } else {
      console.log(`✅ [Sync Success] All ${count} transactions imported successfully into Tally!`);
      // 5. Save progress
      config.lastSyncTime = lastSyncTime;
      await saveConfig(config);
      console.log(`[Sync] Config file updated. Next sync starts from: ${config.lastSyncTime}`);
    }

  } catch (err: any) {
    if (err.code === 'ECONNREFUSED') {
      console.error(`\n❌ [Sync Connection Error] Could not connect to Tally on port ${config.tallyPort}.`);
      console.error(`Ensure Tally is running locally and HTTP Server is enabled:`);
      console.error(`  Gateway of Tally > Press F12 > Advanced Configuration > Enable ODBC/HTTP Server -> Yes, Port -> ${config.tallyPort}\n`);
    } else {
      console.error(`\n❌ [Sync Error] ${err.response?.data?.error || err.message}`);
    }
    process.exit(1);
  }
}

// Run the sync
syncWithTally();
