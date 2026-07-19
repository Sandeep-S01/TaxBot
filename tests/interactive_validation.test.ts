import { afterEach, describe, expect, it } from 'vitest';
import {
  isValidTransactionCategory,
  parseExportReplyId,
} from '../src/handlers/interactiveValidation';
import { getPublicAppOrigin } from '../src/utils/origin';

describe('Interactive WhatsApp reply validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('validates category reply categories before database updates', () => {
    expect(isValidTransactionCategory('sales')).toBe(true);
    expect(isValidTransactionCategory('purchase')).toBe(true);
    expect(isValidTransactionCategory('bad_category')).toBe(false);
  });

  it('parses only supported export replies', () => {
    expect(parseExportReplyId('exp_2026-07_csv')).toEqual({ period: '2026-07', format: 'csv' });
    expect(parseExportReplyId('exp_2026-07_xml')).toEqual({ period: '2026-07', format: 'xml' });
    expect(parseExportReplyId('exp_202607_csv')).toBeNull();
    expect(parseExportReplyId('exp_2026-07_pdf')).toBeNull();
    expect(parseExportReplyId('other_2026-07_csv')).toBeNull();
  });

  it('uses configured public origin before deployment-specific fallbacks', () => {
    process.env.PORT = '4321';
    delete process.env.RENDER_EXTERNAL_URL;

    process.env.APP_ORIGIN = 'https://taxbot.example.com/';
    expect(getPublicAppOrigin()).toBe('https://taxbot.example.com');

    delete process.env.APP_ORIGIN;
    process.env.RENDER_EXTERNAL_URL = 'https://render.example.com/';
    expect(getPublicAppOrigin()).toBe('https://render.example.com');

    delete process.env.RENDER_EXTERNAL_URL;
    expect(getPublicAppOrigin()).toBe('http://localhost:4321');
  });
});
