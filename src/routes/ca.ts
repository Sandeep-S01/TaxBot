import { Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import {
  clearCASessionCookie,
  getAuthenticatedCAId,
  hashPassword,
  issueCASession,
  requireCAAuth,
  requireCACsrf,
  setCASessionCookie,
  verifyPasswordAndMaybeMigrate,
} from '../auth/caAuth';
import { createCAAuditRoutes } from './caAudit';
import { createCAClientRoutes } from './caClients';
import { createCAReportRoutes } from './caReports';
import { createCA, getCAByEmail, getCAById } from '../db/cas';
import { logAuditAction } from '../db/audit';
import {
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
} from '../utils/validation';

async function logAuthAuditBestEffort(
  caId: string,
  actionType: string,
  description: string
): Promise<void> {
  try {
    await logAuditAction(caId, actionType, description);
  } catch (err: any) {
    console.error(`[Audit] ${actionType} audit log failed after successful auth action:`, err.message || err);
  }
}

export function createCARoutes(authLimiter: RateLimitRequestHandler): Router {
  const router = Router();

// --- CA PARTNER CONSOLE API ENDPOINTS ---

// 1. CA Registration
router.post('/api/ca/register', authLimiter, async (req, res) => {
  const { name, password, firmName } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields (name, email, password)' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 10 characters and include letters and numbers' });
  }

  try {
    const existing = await getCAByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'A Chartered Accountant account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const ca = await createCA({
      name,
      email,
      password_hash: passwordHash,
      firm_name: firmName || null,
    });

    await logAuthAuditBestEffort(ca.id, 'REGISTER', `New CA registered: ${ca.name} (${ca.firm_name || 'No Firm'})`);

    // Return CA info (excluding password hash)
    return res.status(201).json({
      message: 'CA registered successfully',
      ca: { id: ca.id, name: ca.name, email: ca.email, firm_name: ca.firm_name },
    });
  } catch (err: any) {
    console.error('CA registration error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Failed to register CA' });
  }
});

// 2. CA Login
router.post('/api/ca/login', authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const ca = await getCAByEmail(email);
    if (!ca) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const verified = await verifyPasswordAndMaybeMigrate(ca, password);
    if (!verified) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { token, csrfToken } = issueCASession(ca);
    setCASessionCookie(res, token);
    await logAuthAuditBestEffort(ca.id, 'LOGIN', `CA logged in: ${ca.name}`);

    return res.status(200).json({
      message: 'Login successful',
      token,
      csrfToken,
      ca: { id: ca.id, name: ca.name, email: ca.email, firm_name: ca.firm_name },
    });
  } catch (err: any) {
    console.error('CA login error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Login failed' });
  }
});

router.use('/api/ca', requireCAAuth);
router.use('/api/ca', requireCACsrf);

router.post('/api/ca/logout', (req, res) => {
  clearCASessionCookie(res);
  return res.status(200).json({ message: 'Logout successful' });
});

router.get('/api/ca/session', async (req, res) => {
  const caId = getAuthenticatedCAId(req);

  try {
    const ca = await getCAById(caId);
    if (!ca) {
      clearCASessionCookie(res);
      return res.status(401).json({ error: 'Unauthorized: CA account not found' });
    }
    return res.status(200).json({
      ca: { id: ca.id, name: ca.name, email: ca.email, firm_name: ca.firm_name },
      csrfToken: (req as any).caCsrfToken,
    });
  } catch (err: any) {
    console.error('Error fetching CA session:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not fetch session' });
  }
});

router.use('/api/ca', createCAClientRoutes());
router.use('/api/ca', createCAReportRoutes());
router.use('/api/ca/audit', createCAAuditRoutes());

// --- END CA ENDPOINTS ---

  return router;
}
