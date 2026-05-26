import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { verifyWebhook } from './webhook/verify';
import { handleWebhook } from './webhook/handler';
import { initRemindersJob } from './jobs/reminders';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Standard middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'TaxBot API',
    uptime: process.uptime(),
  });
});

// Meta WhatsApp Webhook endpoints
app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWebhook);

// Initialize scheduled cron jobs
initRemindersJob();

// Start the server
const server = app.listen(PORT, () => {
  console.log(`🚀 TaxBot Express server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Webhook Verification Endpoint: GET /webhook');
  console.log('Webhook Message Handler Endpoint: POST /webhook');
});

export { app, server };
