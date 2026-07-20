import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();
const single = vi.fn();
const select = vi.fn(() => ({ single, eq: () => ({ maybeSingle }) }));
const insert = vi.fn(() => ({ select }));
const updateEq = vi.fn();
const update = vi.fn(() => ({ eq: updateEq }));
const from = vi.fn(() => ({ insert, select, update }));

vi.mock('../src/db/client', () => ({
  supabase: { from },
}));

describe('inbound message idempotency helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims a new Meta message id once', async () => {
    const { claimInboundMessage } = await import('../src/db/inboundMessages');
    single.mockResolvedValueOnce({
      data: {
        id: 'row-1',
        meta_message_id: 'wamid-1',
        phone: '919876543210',
        message_type: 'text',
        status: 'received',
        attempts: 0,
      },
      error: null,
    });

    const result = await claimInboundMessage('wamid-1', '919876543210', 'text');

    expect(result.claimed).toBe(true);
    expect(result.message?.meta_message_id).toBe('wamid-1');
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      meta_message_id: 'wamid-1',
      status: 'received',
    })]);
  });

  it('returns claimed false when the Meta message id already exists', async () => {
    const { claimInboundMessage } = await import('../src/db/inboundMessages');
    single.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });
    maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'row-1',
        meta_message_id: 'wamid-1',
        phone: '919876543210',
        message_type: 'text',
        status: 'processed',
        attempts: 1,
      },
      error: null,
    });

    const result = await claimInboundMessage('wamid-1', '919876543210', 'text');

    expect(result.claimed).toBe(false);
    expect(result.message?.status).toBe('processed');
  });

  it('fails open when inbound idempotency storage has not been migrated yet', async () => {
    const { claimInboundMessage, updateInboundMessageStatus } = await import('../src/db/inboundMessages');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    single.mockResolvedValueOnce({
      data: null,
      error: { code: '42P01', message: 'relation "inbound_messages" does not exist' },
    });

    const result = await claimInboundMessage('wamid-2', '919876543210', 'text');

    expect(result).toEqual({ message: null, claimed: true });

    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '42P01', message: 'relation "inbound_messages" does not exist' },
    });
    updateEq.mockResolvedValueOnce({
      data: null,
      error: { code: '42P01', message: 'relation "inbound_messages" does not exist' },
    });

    await expect(updateInboundMessageStatus('wamid-2', 'processing')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
