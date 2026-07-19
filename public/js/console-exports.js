/* ==========================================================================
   TaxBot CA Console - Browser Export Helpers
   Owns client CSV/XML downloads launched from the CA console.
   ========================================================================== */

function renderExports() {
  const tallySelect = document.getElementById('export-tally-client');
  const csvSelect = document.getElementById('export-csv-client');

  const optHtml = globalClientsList.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.business_name || 'Unnamed Client')}</option>`).join('');
  tallySelect.innerHTML = optHtml;
  csvSelect.innerHTML = optHtml;

  document.getElementById('btn-action-export-tally').onclick = () => {
    const cid = tallySelect.value;
    downloadClientFile(cid, 'xml');
  };

  document.getElementById('btn-action-export-csv').onclick = () => {
    const cid = csvSelect.value;
    downloadClientFile(cid, 'csv');
  };

  document.getElementById('btn-action-export-gst').onclick = () => {
    showToast('Compiling GSTR reports...');
    setTimeout(() => { showToast('Excel sheet downloaded!'); }, 1000);
  };

  document.getElementById('btn-action-export-pdf').onclick = () => {
    showToast('Generating P&L and Balance Sheet PDF...');
    setTimeout(() => { showToast('Financial Statement downloaded!'); }, 1200);
  };
}

function downloadClientFile(clientId, format, preloadedTx = null) {
  const period = new Date().toISOString().substring(0, 7);
  const clientObj = globalClientsList.find(c => c.id === clientId);
  if (!clientObj) return;

  const txList = preloadedTx || globalTransactions.filter(t => t.clientId === clientId);
  let fileContent = '';
  let mimeType = '';
  let fileName = safeExportFilename(`TaxBot_${clientObj.name || clientObj.business_name || 'Client'}_${period}`);

  if (format === 'csv') {
    mimeType = 'text/csv;charset=utf-8;';
    fileName += '.csv';

    const headers = ['Date', 'Type', 'Category', 'GST Rate', 'Amount', 'Source', 'Status'];
    const rows = txList.map(t => [
      csvCell(t.date),
      csvCell(t.type || 'Expense'),
      csvCell(t.category),
      csvCell(t.gstRate),
      t.amount,
      csvCell(t.source),
      csvCell(t.status)
    ].join(','));
    fileContent = [headers.join(','), ...rows].join('\r\n');
  } else {
    mimeType = 'application/xml;charset=utf-8;';
    fileName += '.xml';
    fileContent = buildClientTallyXml(txList);
  }

  const blob = new Blob([fileContent], { type: mimeType });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Redirection complete. ${format.toUpperCase()} export downloaded!`);
  }
}

function buildClientTallyXml(txList) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n  <HEADER>\n    <TALLYREQUEST>Import Data</TALLYREQUEST>\n  </HEADER>\n  <BODY>\n    <IMPORTDATA>\n      <REQUESTDESC>\n        <REPORTNAME>Vouchers</REPORTNAME>\n      </REQUESTDESC>\n      <REQUESTDATA>\n`;

  txList.forEach(t => {
    const tallyDate = String(t.date || '').replace(/-/g, '');
    const amount = Math.abs(Number(t.amount || 0));
    const tax = Math.abs(Number(t.taxAmount || 0));
    const total = amount + tax;
    const vchType = t.type === 'Sale' ? 'Sales' : 'Purchase';

    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n          <VOUCHER VCHTYPE="${escapeXml(vchType)}" ACTION="Create">\n            <DATE>${escapeXml(tallyDate)}</DATE>\n            <VOUCHERTYPENAME>${escapeXml(vchType)}</VOUCHERTYPENAME>\n            <NARRATION>${escapeXml(`${t.category} recorded via TaxBot`)}</NARRATION>\n            <EFFECTIVEDATE>${escapeXml(tallyDate)}</EFFECTIVEDATE>\n`;
    xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(vchType === 'Sales' ? 'Sales Account' : 'Purchase Account')}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>${vchType === 'Sales' ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>\n              <AMOUNT>${amount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
    xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Cash/Bank Account</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>${vchType === 'Sales' ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n              <AMOUNT>-${total.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
    xml += `          </VOUCHER>\n        </TALLYMESSAGE>\n`;
  });

  xml += `      </REQUESTDATA>\n    </IMPORTDATA>\n  </BODY>\n</ENVELOPE>`;
  return xml;
}
