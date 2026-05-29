import { Transaction } from '../types';

/**
 * Generates an Excel-compatible CSV string from a list of transactions.
 * Properly escapes quotes, commas, and newlines.
 */
export function exportToCSV(transactions: Transaction[]): string {
  const headers = [
    'Date',
    'Vendor/Party',
    'Category',
    'GST Category',
    'GST Rate (%)',
    'Amount (Excl. Tax)',
    'GST Tax Amount',
    'Total Amount',
    'Invoice Number',
    'Description',
    'Source'
  ];

  const escapeCSV = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = transactions.map((tx) => {
    const totalAmount = Number(tx.amount) + Number(tx.tax_amount || 0);
    return [
      tx.date,
      escapeCSV(tx.vendor_name),
      tx.category.toUpperCase(),
      escapeCSV(tx.gst_category),
      tx.gst_rate,
      tx.amount,
      tx.tax_amount || 0,
      totalAmount,
      escapeCSV(tx.invoice_number),
      escapeCSV(tx.description),
      tx.source
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Generates a Tally-compliant XML string for importing accounting vouchers into Tally Prime / ERP 9.
 * Uses standard voucher types: Sales, Purchase, and Payment.
 */
export function exportToTallyXML(transactions: Transaction[], clientBusinessName: string): string {
  const businessName = clientBusinessName || 'Client Account';
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<ENVELOPE>\n`;
  xml += `  <HEADER>\n`;
  xml += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
  xml += `  </HEADER>\n`;
  xml += `  <BODY>\n`;
  xml += `    <IMPORTDATA>\n`;
  xml += `      <REQUESTDESC>\n`;
  xml += `        <REPORTNAME>Vouchers</REPORTNAME>\n`;
  xml += `      </REQUESTDESC>\n`;
  xml += `      <REQUESTDATA>\n`;

  for (const tx of transactions) {
    const tallyDate = tx.date.replace(/-/g, ''); // YYYYMMDD format
    const amount = Number(tx.amount);
    const tax = Number(tx.tax_amount || 0);
    const total = amount + tax;
    const vendor = tx.vendor_name || 'Cash/Sundry Creditor';
    const invoiceNo = tx.invoice_number || '';
    const desc = tx.description || `${tx.category} transaction`;

    let vchType = 'Payment';
    if (tx.category === 'sales') {
      vchType = 'Sales';
    } else if (tx.category === 'purchase') {
      vchType = 'Purchase';
    }

    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xml += `          <VOUCHER VCHTYPE="${vchType}" ACTION="Create">\n`;
    xml += `            <DATE>${tallyDate}</DATE>\n`;
    xml += `            <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>\n`;
    xml += `            <REFERENCE>${invoiceNo}</REFERENCE>\n`;
    xml += `            <NARRATION>${desc}</NARRATION>\n`;
    xml += `            <EFFECTIVEDATE>${tallyDate}</EFFECTIVEDATE>\n`;

    if (vchType === 'Sales') {
      // SALES VOUCHER: Debit Cash/Debtor, Credit Sales, Credit GST Output
      // Debited account (negative in Tally XML representation of ledgers list)
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Cash/Bank Account</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>-${total.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;

      // Credited Sales Account (positive in Tally XML)
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Sales Account</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>${amount.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;

      // Credited GST Output Account
      if (tax > 0) {
        const gstLedgerName = tx.gst_rate > 0 ? `Output GST @ ${tx.gst_rate}%` : 'Output GST';
        xml += `            <ALLLEDGERENTRIES.LIST>\n`;
        xml += `              <LEDGERNAME>${gstLedgerName}</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${tax.toFixed(2)}</AMOUNT>\n`;
        xml += `            </ALLLEDGERENTRIES.LIST>\n`;
      }
    } else if (vchType === 'Purchase') {
      // PURCHASE VOUCHER: Debit Purchase, Debit GST Input, Credit Cash/Creditor
      // Debited Purchase Account
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Purchase Account</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>${amount.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;

      // Debited GST Input Account
      if (tax > 0) {
        const gstLedgerName = tx.gst_rate > 0 ? `Input GST @ ${tx.gst_rate}%` : 'Input GST';
        xml += `            <ALLLEDGERENTRIES.LIST>\n`;
        xml += `              <LEDGERNAME>${gstLedgerName}</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${tax.toFixed(2)}</AMOUNT>\n`;
        xml += `            </ALLLEDGERENTRIES.LIST>\n`;
      }

      // Credited Vendor Account
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>${vendor}</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>-${total.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    } else {
      // PAYMENT/EXPENSE VOUCHER: Debit Expense, Debit GST Input, Credit Cash/Bank
      // Debited Expense Account
      const expenseLedgerName = tx.description ? `${tx.description.substring(0, 30)} Ledger` : 'General Expense';
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>${expenseLedgerName}</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>${amount.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;

      // Debited GST Input Account
      if (tax > 0) {
        const gstLedgerName = tx.gst_rate > 0 ? `Input GST @ ${tx.gst_rate}%` : 'Input GST';
        xml += `            <ALLLEDGERENTRIES.LIST>\n`;
        xml += `              <LEDGERNAME>${gstLedgerName}</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${tax.toFixed(2)}</AMOUNT>\n`;
        xml += `            </ALLLEDGERENTRIES.LIST>\n`;
      }

      // Credited Cash/Bank Account
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Cash/Bank Account</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>-${total.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    }

    xml += `          </VOUCHER>\n`;
    xml += `        </TALLYMESSAGE>\n`;
  }

  xml += `      </REQUESTDATA>\n`;
  xml += `    </IMPORTDATA>\n`;
  xml += `  </BODY>\n`;
  xml += `</ENVELOPE>`;

  return xml;
}
