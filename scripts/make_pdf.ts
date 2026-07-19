import fs from 'fs';
import path from 'path';

function createInvoicePDF() {
  const content = `BT
/F1 12 Tf
72 712 Td
(Invoice Number: INV-2026-8888) Tj
0 -18 Td
(Vendor Name: Acme Business Solutions) Tj
0 -18 Td
(Invoice Date: 2026-06-10) Tj
0 -18 Td
(Subtotal Amount: 25000.00) Tj
0 -18 Td
(GST Rate: 18%) Tj
0 -18 Td
(CGST Amount: 2250.00) Tj
0 -18 Td
(SGST Amount: 2250.00) Tj
0 -18 Td
(Tax Amount: 4500.00) Tj
0 -18 Td
(Total Invoice Amount: 29500.00) Tj
ET`;

  const streamLength = content.length;

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${streamLength} >>
stream
${content}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000242 00000 n 
0000000311 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
450
%%EOF
`;

  const dest = path.resolve(__dirname, '../test_invoice.pdf');
  fs.writeFileSync(dest, pdf);
  console.log(`Successfully generated custom invoice PDF at: ${dest}`);
}

createInvoicePDF();
