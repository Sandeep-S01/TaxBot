import { supabase } from './client';
import { InboundMessage, InboundMessageStatus, WhatsAppMessage } from '../types';

const IDEMPOTENCY_STORAGE_UNAVAILABLE_CODES = new Set(['42P01', '42703']);

export async function claimInboundMessage(
  metaMessageId: string,
  phone: string,
  messageType: WhatsAppMessage['type']
): Promise<{ message: InboundMessage | null; claimed: boolean }> {
  const { data, error } = await supabase
    .from('inbound_messages')
    .insert([{
      meta_message_id: metaMessageId,
      phone,
      message_type: messageType,
      status: 'received',
      attempts: 0,
    }])
    .select()
    .single();

  if (!error) {
    return { message: data, claimed: true };
  }

  if (error.code === '23505') {
    const existing = await getInboundMessageByMetaId(metaMessageId);
    return { message: existing, claimed: false };
  }

  if (isIdempotencyStorageUnavailable(error)) {
    console.warn('Inbound message idempotency storage is unavailable; processing without duplicate protection:', {
      code: error.code,
      message: error.message,
    });
    return { message: null, claimed: true };
  }

  console.error('Error claiming inbound message:', error);
  throw error;
}

export async function getInboundMessageByMetaId(metaMessageId: string): Promise<InboundMessage | null> {
  const { data, error } = await supabase
    .from('inbound_messages')
    .select('*')
    .eq('meta_message_id', metaMessageId)
    .maybeSingle();

  if (error) {
    if (isIdempotencyStorageUnavailable(error)) {
      console.warn('Inbound message idempotency lookup skipped because storage is unavailable:', {
        code: error.code,
        message: error.message,
      });
      return null;
    }

    console.error('Error fetching inbound message:', error);
    throw error;
  }

  return data;
}

export async function updateInboundMessageStatus(
  metaMessageId: string,
  status: InboundMessageStatus,
  updates: Partial<Pick<InboundMessage, 'client_id' | 'last_error'>> = {}
): Promise<void> {
  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    ...updates,
  };

  if (status === 'processing') {
    payload.attempts = await nextAttemptCount(metaMessageId);
  }
  if (status === 'processed') {
    payload.processed_at = new Date().toISOString();
    payload.last_error = null;
  }

  const { error } = await supabase
    .from('inbound_messages')
    .update(payload)
    .eq('meta_message_id', metaMessageId);

  if (error) {
    if (isIdempotencyStorageUnavailable(error)) {
      console.warn('Inbound message status update skipped because storage is unavailable:', {
        code: error.code,
        message: error.message,
      });
      return;
    }
    console.error('Error updating inbound message status:', error);
    throw error;
  }
}

async function nextAttemptCount(metaMessageId: string): Promise<number> {
  const existing = await getInboundMessageByMetaId(metaMessageId);
  return Number(existing?.attempts || 0) + 1;
}

function isIdempotencyStorageUnavailable(error: any): boolean {
  return IDEMPOTENCY_STORAGE_UNAVAILABLE_CODES.has(String(error?.code || ''));
}
