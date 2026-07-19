import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { CA, Client, Transaction } from '../types';
import { safeFilename } from '../utils/sanitize';

interface StreamCAReportPdfParams {
  res: Response;
  ca: CA | null;
  client: Client;
  transactions: Transaction[];
  reportType: string;
  targetPeriod: string;
}

export function streamCAReportPdf({
  res,
  ca,
  client,
  transactions,
  reportType,
  targetPeriod,
}: StreamCAReportPdfParams): void {
  const confirmedTransactions = transactions.filter((tx) => !tx.status || tx.status === 'confirmed');
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  const reportFilename = safeFilename(`TaxBot_Report_${reportType.toUpperCase()}_${client.business_name || client.name}_${targetPeriod}`, 'TaxBot_Report');
  res.setHeader('Content-Disposition', `inline; filename="${reportFilename}.pdf"`);
  doc.pipe(res);

  doc.fillColor('#2563EB').fontSize(24).font('Helvetica-Bold').text('TaxBot Partner', 50, 45);
  doc.fillColor('#64748B').fontSize(10).font('Helvetica').text('AI-First CA Platform', 50, 75);

  if (ca) {
    doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text(ca.firm_name || ca.name, 400, 45, { align: 'right', width: 145 });
    doc.fillColor('#64748B').fontSize(9).font('Helvetica').text(`CA Email: ${ca.email}`, 400, 60, { align: 'right', width: 145 });
  }

  doc.lineWidth(1).strokeColor('#E2E8F0').moveTo(50, 95).lineTo(545, 95).stroke();

  doc.fillColor('#0F172A').fontSize(14).font('Helvetica-Bold').text('Client & Period Details', 50, 110);
  doc.fontSize(10).font('Helvetica')
    .text(`Business Name: ${client.business_name || client.name || 'N/A'}`, 50, 130)
    .text(`GSTIN: ${client.gstin || 'N/A'}`, 50, 145)
    .text(`Owner: ${client.name}`, 50, 160)
    .text(`Phone: +${client.phone}`, 50, 175);

  doc.fontSize(10).font('Helvetica')
    .text(`Report Type: ${reportType === 'pl' ? 'Profit & Loss Statement' : 'GST Return Summary'}`, 300, 130)
    .text(`Filing Period: ${targetPeriod}`, 300, 145)
    .text(`Generated On: ${new Date().toLocaleDateString('en-IN')}`, 300, 160)
    .text(`Review Needed: ${transactions.filter((tx) => tx.status === 'needs_review').length} | Rejected: ${transactions.filter((tx) => tx.status === 'rejected').length}`, 300, 175);

  let yPos = 205;
  let salesTotal = 0;
  let expenseTotal = 0;

  confirmedTransactions.forEach((tx) => {
    const amount = Math.abs(Number(tx.amount));
    if (tx.category === 'sales') {
      salesTotal += amount;
    } else {
      expenseTotal += amount;
    }
  });

  doc.lineWidth(1).rect(50, yPos, 495, 60).fillAndStroke('#F8FAFC', '#E2E8F0');

  if (reportType === 'pl') {
    const netProfit = salesTotal - expenseTotal;
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text('Total Revenue', 70, yPos + 15);
    doc.fillColor('#2563EB').fontSize(14).text(`INR ${salesTotal.toLocaleString('en-IN')}`, 70, yPos + 30);

    doc.fillColor('#0F172A').fontSize(10).text('Total Expenses', 220, yPos + 15);
    doc.fillColor('#EF4444').fontSize(14).text(`INR ${expenseTotal.toLocaleString('en-IN')}`, 220, yPos + 30);

    doc.fillColor('#0F172A').fontSize(10).text('Net Profit / Loss', 370, yPos + 15);
    doc.fillColor(netProfit >= 0 ? '#16A34A' : '#DC2626').fontSize(14).text(`INR ${netProfit.toLocaleString('en-IN')}`, 370, yPos + 30);
  } else {
    const salesTax = salesTotal * 0.18;
    const purchaseTax = expenseTotal * 0.18;
    const netGstPayable = Math.max(0, salesTax - purchaseTax);

    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text('Outward GST (Liability)', 70, yPos + 15);
    doc.fillColor('#2563EB').fontSize(14).text(`INR ${salesTax.toLocaleString('en-IN')}`, 70, yPos + 30);

    doc.fillColor('#0F172A').fontSize(10).text('Inward GST (ITC)', 220, yPos + 15);
    doc.fillColor('#16A34A').fontSize(14).text(`INR ${purchaseTax.toLocaleString('en-IN')}`, 220, yPos + 30);

    doc.fillColor('#0F172A').fontSize(10).text('Net GST Payable', 370, yPos + 15);
    doc.fillColor(netGstPayable > 0 ? '#F59E0B' : '#64748B').fontSize(14).text(`INR ${netGstPayable.toLocaleString('en-IN')}`, 370, yPos + 30);
  }

  yPos = 290;
  doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text('Transaction Ledgers Detail', 50, yPos);

  yPos = 310;
  drawTableHeader(doc, yPos);
  yPos += 20;

  doc.font('Helvetica').fontSize(8);
  transactions.forEach((tx) => {
    doc.moveTo(50, yPos).lineTo(545, yPos).strokeColor('#F1F5F9').stroke();

    const amount = Number(tx.amount);
    const isSale = tx.category === 'sales';
    const categoryText = tx.description || (tx.category ? tx.category.charAt(0).toUpperCase() + tx.category.slice(1) : 'Expense');

    doc.fillColor('#0F172A')
      .text(tx.date || '-', 60, yPos + 6)
      .fillColor(isSale ? '#16A34A' : '#EF4444')
      .text(isSale ? 'SALE' : 'EXP', 120, yPos + 6)
      .fillColor('#0F172A')
      .text(categoryText.substring(0, 28), 165, yPos + 6)
      .text(formatStatus(tx), 320, yPos + 6)
      .text(formatSource(tx), 390, yPos + 6)
      .text(`${isSale ? '+' : '-'}${Math.abs(amount).toLocaleString('en-IN')}`, 470, yPos + 6, { align: 'right', width: 65 });

    yPos += 20;

    if (yPos > 720) {
      doc.addPage();
      yPos = 50;
      drawTableHeader(doc, yPos);
      yPos += 20;
      doc.font('Helvetica').fontSize(8);
    }
  });

  doc.moveTo(50, yPos).lineTo(545, yPos).strokeColor('#E2E8F0').stroke();
  doc.fillColor('#94A3B8').fontSize(8).text('This is an automated ledger summary generated by TaxBot. All logs reconciled via Supabase database client records.', 50, 770, { align: 'center', width: 495 });
  doc.end();
}

function drawTableHeader(doc: PDFKit.PDFDocument, yPos: number): void {
  doc.rect(50, yPos, 495, 20).fill('#EFF6FF');
  doc.fillColor('#2563EB').fontSize(8).font('Helvetica-Bold')
    .text('Date', 60, yPos + 6)
    .text('Type', 120, yPos + 6)
    .text('Category / Description', 165, yPos + 6)
    .text('Status', 320, yPos + 6)
    .text('Source', 390, yPos + 6)
    .text('Amount (INR)', 470, yPos + 6, { align: 'right', width: 65 });
}

function formatStatus(tx: Transaction): string {
  if (tx.status === 'needs_review') return 'Review';
  if (tx.status === 'rejected') return 'Rejected';
  if (tx.status === 'draft') return 'Draft';
  return tx.confidence === 'low' ? 'Low Conf' : 'Confirmed';
}

function formatSource(tx: Transaction): string {
  if (tx.source === 'manual') return 'Manual';
  if (tx.source === 'whatsapp_image') return 'WA Img';
  if (tx.source === 'whatsapp_pdf') return 'WA PDF';
  if (tx.source === 'whatsapp_text') return 'WA Text';
  return tx.source;
}
