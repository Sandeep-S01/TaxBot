import { describe, it, expect } from 'vitest';
import { exportToCSV, exportToTallyXML } from '../src/utils/exporter';
import { Transaction } from '../src/types';

describe('CA Export Generators (CSV and Tally XML)', () => {
  const mockTransactions: Transaction[] = [
    {
      id: 'tx1',
      client_id: 'client1',
      date: '2026-05-10',
      vendor_name: 'Regular Customer',
      description: 'Consulting Services Provided',
      amount: 10000.0,
      tax_amount: 1800.0,
      category: 'sales',
      gst_category: 'B2C',
      gst_rate: 18,
      hsn_sac: '998311',
      invoice_number: 'INV-001',
      source: 'whatsapp_image',
      raw_text: null,
      confidence: 'high',
      status: 'confirmed',
      review_reason: null,
      confirmed_at: '2026-05-10T12:00:00Z',
      created_at: '2026-05-10T12:00:00Z',
    },
    {
      id: 'tx2',
      client_id: 'client1',
      date: '2026-05-12',
      vendor_name: 'Local Distributor Inc.',
      description: 'Raw Materials Purchased',
      amount: 5000.0,
      tax_amount: 600.0,
      category: 'purchase',
      gst_category: 'B2B',
      gst_rate: 12,
      hsn_sac: '3901',
      invoice_number: 'DIST-983',
      source: 'whatsapp_image',
      raw_text: null,
      confidence: 'high',
      status: 'confirmed',
      review_reason: null,
      confirmed_at: '2026-05-12T12:00:00Z',
      created_at: '2026-05-12T12:00:00Z',
    },
    {
      id: 'tx3',
      client_id: 'client1',
      date: '2026-05-15',
      vendor_name: 'Local Tea Vendor',
      description: 'Office tea, coffee & snacks, with a comma and "quotes" in description',
      amount: 300.0,
      tax_amount: 0,
      category: 'expense',
      gst_category: 'exempt',
      gst_rate: 0,
      hsn_sac: null,
      invoice_number: null,
      source: 'manual',
      raw_text: null,
      confidence: 'high',
      status: 'confirmed',
      review_reason: null,
      confirmed_at: '2026-05-15T12:00:00Z',
      created_at: '2026-05-15T12:00:00Z',
    },
  ];

  it('should generate a correct Excel CSV file', () => {
    const csvContent = exportToCSV(mockTransactions);
    
    // Check if headers exist
    expect(csvContent).toContain('Date,Vendor/Party,Category,GST Category,GST Rate (%)');
    
    // Check if lines are formatted and quotes are escaped correctly
    expect(csvContent).toContain('2026-05-10,Regular Customer,SALES,B2C,18,10000,1800,11800,INV-001,Consulting Services Provided,whatsapp_image');
    
    // Verify escaping of comma and double quotes in row 3
    expect(csvContent).toContain('2026-05-15,Local Tea Vendor,EXPENSE,exempt,0,300,0,300,,"Office tea, coffee & snacks, with a comma and ""quotes"" in description",manual');
  });

  it('should generate a valid Tally XML structure with local CGST and SGST splits', () => {
    const xmlContent = exportToTallyXML(mockTransactions, 'Ananta Store');

    // Verify envelope headers
    expect(xmlContent).toContain('<ENVELOPE>');
    expect(xmlContent).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xmlContent).toContain('<REPORTNAME>Vouchers</REPORTNAME>');

    // Verify Sales Voucher with 50-50 CGST & SGST splits
    expect(xmlContent).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create">');
    expect(xmlContent).toContain('<DATE>20260510</DATE>');
    expect(xmlContent).toContain('<LEDGERNAME>Sales Account</LEDGERNAME>');
    expect(xmlContent).toContain('<AMOUNT>10000.00</AMOUNT>');
    expect(xmlContent).toContain('<LEDGERNAME>Output CGST @ 9%</LEDGERNAME>');
    expect(xmlContent).toContain('<AMOUNT>900.00</AMOUNT>');
    expect(xmlContent).toContain('<LEDGERNAME>Output SGST @ 9%</LEDGERNAME>');
    expect(xmlContent).toContain('<AMOUNT>900.00</AMOUNT>');

    // Verify Purchase Voucher with Input CGST & SGST splits
    expect(xmlContent).toContain('<VOUCHER VCHTYPE="Purchase" ACTION="Create">');
    expect(xmlContent).toContain('<DATE>20260512</DATE>');
    expect(xmlContent).toContain('<LEDGERNAME>Local Distributor Inc.</LEDGERNAME>');
    expect(xmlContent).toContain('<AMOUNT>5000.00</AMOUNT>');
    expect(xmlContent).toContain('<LEDGERNAME>Input CGST @ 6%</LEDGERNAME>');
    expect(xmlContent).toContain('<AMOUNT>300.00</AMOUNT>');
    expect(xmlContent).toContain('<LEDGERNAME>Input SGST @ 6%</LEDGERNAME>');
    expect(xmlContent).toContain('<AMOUNT>300.00</AMOUNT>');

    // Verify Payment/Expense Voucher
    expect(xmlContent).toContain('<VOUCHER VCHTYPE="Payment" ACTION="Create">');
    expect(xmlContent).toContain('<DATE>20260515</DATE>');
    expect(xmlContent).toContain('<LEDGERNAME>Office tea, coffee &amp; snacks, w Ledger</LEDGERNAME>'); // Truncated to 30 chars
    expect(xmlContent).toContain('<AMOUNT>300.00</AMOUNT>');

    expect(xmlContent).toContain('</ENVELOPE>');
  });

  it('should generate a valid Tally XML structure with IGST split for inter-state transactions', () => {
    // Set different GSTIN prefixes: Client: 27 (MH), Vendor: 09 (UP)
    const clientGstin = '27AAAAA1111A1Z1';
    const interStateTransactions: Transaction[] = [
      {
        ...mockTransactions[0],
        vendor_gstin: '09BBBBB2222B2Z2'
      }
    ];

    const xmlContent = exportToTallyXML(interStateTransactions, 'Ananta Store', clientGstin);

    // Verify Sales Voucher has 100% IGST ledger and no CGST/SGST ledgers
    expect(xmlContent).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create">');
    expect(xmlContent).toContain('<LEDGERNAME>Output IGST @ 18%</LEDGERNAME>');
    expect(xmlContent).toContain('<AMOUNT>1800.00</AMOUNT>');
    expect(xmlContent).not.toContain('Output CGST');
    expect(xmlContent).not.toContain('Output SGST');
  });
});
