import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function download() {
  const url = 'https://pdfobject.com/pdf/sample.pdf';
  const dest = path.resolve(__dirname, '../test_invoice.pdf');
  console.log(`Downloading PDF from ${url} to ${dest}...`);
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);
    writer.on('finish', () => {
      console.log('Download complete!');
      process.exit(0);
    });
    writer.on('error', (err) => {
      console.error('Writer error:', err);
      process.exit(1);
    });
  } catch (err: any) {
    console.error('Download failed:', err.message);
    process.exit(1);
  }
}

download();
