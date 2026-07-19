import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeXml, safeFilename } from '../src/utils/sanitize';

describe('Security output escaping helpers', () => {
  it('escapes HTML special characters for rendered pages', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'bad'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;bad&#39;'
    );
  });

  it('escapes XML special characters for Tally exports', () => {
    expect(escapeXml(`A&B <Ledger> "quoted" 'single'`)).toBe(
      'A&amp;B &lt;Ledger&gt; &quot;quoted&quot; &apos;single&apos;'
    );
  });

  it('sanitizes filenames for content-disposition headers', () => {
    expect(safeFilename('TaxBot: A/B <May>?*')).toBe('TaxBot_A_B_May');
  });
});
