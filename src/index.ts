import dotenv from 'dotenv';
import { createApp } from './app';
import { validateEnvironment } from './config/env';
import { registerGracefulShutdown } from './runtime/serverLifecycle';

dotenv.config();
validateEnvironment();

const PORT = process.env.PORT || 3000;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`TaxBot Express server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Webhook Verification Endpoint: GET /webhook');
  console.log('Webhook Message Handler Endpoint: POST /webhook');
});

registerGracefulShutdown(server);

export { app, server };
