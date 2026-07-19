import { isUuid } from '../utils/validation';

const ACTION_TYPE_RE = /^[A-Z0-9_:-]{1,64}$/;
const MAX_DESCRIPTION_LENGTH = 500;

export interface NormalizedAuditAction {
  actionType: string;
  description: string;
  clientId: string | null;
}

export function normalizeAuditActionPayload(body: any): { value?: NormalizedAuditAction; error?: string } {
  const actionType = typeof body?.actionType === 'string' ? body.actionType.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const clientId = typeof body?.clientId === 'string' && body.clientId.trim() ? body.clientId.trim() : null;

  if (!actionType || !description) {
    return { error: 'Missing required parameters: actionType and description' };
  }
  if (!ACTION_TYPE_RE.test(actionType)) {
    return { error: 'Invalid actionType format' };
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` };
  }
  if (clientId && !isUuid(clientId)) {
    return { error: 'Invalid client id' };
  }

  return {
    value: {
      actionType,
      description,
      clientId,
    },
  };
}
