import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

// Determine backend URL
const PORT = process.env.PORT || 3000;
const BACKEND_URL = `http://localhost:${PORT}`;

function showHelp() {
  console.log(`
============================================================
           TaxBot Webhook Simulator Tool
============================================================
Usage:
  npx tsx scripts/simulate_whatsapp.ts <type> [args...]

Commands:
  1. Simulate WhatsApp Text transaction:
     npx tsx scripts/simulate_whatsapp.ts text <phone> <message_body>
     Example:
       npx tsx scripts/simulate_whatsapp.ts text 919876543210 "add sale 15000 Kirana Goods"
       npx tsx scripts/simulate_whatsapp.ts text 919876543210 "add expense 1800 Office snacks"

  2. Simulate Document PDF Upload (Inbound Email OCR parser):
     npx tsx scripts/simulate_whatsapp.ts doc <clientId> <path_to_local_pdf>
     Example:
       npx tsx scripts/simulate_whatsapp.ts doc acme "./test_invoice.pdf"

============================================================
`);
}

// WhatsApp Text Webhook simulator
async function simulateText(phone: string, body: string) {
  console.log(`\n[Simulator] Simulating WhatsApp text message from +${phone}: "${body}"`);

  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1234567890',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15556700514',
                phone_number_id: '123456789'
              },
              contacts: [
                {
                  profile: {
                    name: 'Test Business Owner'
                  },
                  wa_id: phone
                }
              ],
              messages: [
                {
                  from: phone,
                  id: `wamid.HBgL${phone}wMDUCA${Math.floor(Math.random() * 100000)}==`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: {
                    body: body
                  },
                  type: 'text'
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };

  try {
    const res = await axios.post(`${BACKEND_URL}/webhook`, payload);
    console.log(`[Simulator] Webhook response code: ${res.status}`);
    console.log(`[Simulator] Response body: ${res.data}`);
    console.log(`[Simulator] Success! Check console.html to verify the transaction was written.`);
  } catch (err: any) {
    console.error(`[Simulator] Error sending webhook POST request:`, err.message);
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(`Body:`, err.response.data);
    }
  }
}

// Inbound Email PDF upload simulator
async function simulatePdfUpload(clientId: string, pdfPath: string) {
  const absolutePath = path.resolve(pdfPath);
  console.log(`\n[Simulator] Uploading PDF: "${absolutePath}" to client ledger: "${clientId}"`);

  if (!fs.existsSync(absolutePath)) {
    console.error(`[Simulator] Error: Local PDF file does not exist at "${absolutePath}"`);
    return;
  }

  const form = new FormData();
  form.append('to', `ledger-${clientId}@taxbot.in`);
  form.append('from', 'owner@business.com');
  form.append('subject', 'Monthly invoice logs');
  form.append('attachments', fs.createReadStream(absolutePath), {
    filename: path.basename(absolutePath),
    contentType: 'application/pdf'
  });

  try {
    const res = await axios.post(`${BACKEND_URL}/api/webhooks/email`, form, {
      headers: {
        ...form.getHeaders(),
        ...(process.env.EMAIL_WEBHOOK_SECRET ? { 'x-taxbot-email-secret': process.env.EMAIL_WEBHOOK_SECRET } : {}),
      }
    });
    console.log(`[Simulator] Webhook response code: ${res.status}`);
    console.log(`[Simulator] Response body:`, res.data);
    console.log(`[Simulator] Success! Backend processing started in background. Check database logs.`);
  } catch (err: any) {
    console.error(`[Simulator] Error uploading PDF:`, err.message);
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(`Body:`, err.response.data);
    }
  }
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    showHelp();
    return;
  }

  const type = args[0].toLowerCase();

  if (type === 'text') {
    if (args.length < 3) {
      console.error('Error: Missing arguments for text simulation.');
      showHelp();
      return;
    }
    const phone = args[1].replace(/\+/g, '');
    const body = args[2];
    await simulateText(phone, body);
  } else if (type === 'doc' || type === 'document' || type === 'pdf') {
    if (args.length < 3) {
      console.error('Error: Missing arguments for document simulation.');
      showHelp();
      return;
    }
    const clientId = args[1];
    const pdfPath = args[2];
    await simulatePdfUpload(clientId, pdfPath);
  } else {
    console.error(`Error: Unknown simulation type "${type}"`);
    showHelp();
  }
}

run();
