import fs from 'fs';
import path from 'path';

function walkDir(dir: string, callback: (filePath: string) => void) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist') {
        walkDir(dirPath, callback);
      }
    } else {
      callback(dirPath);
    }
  });
}

const searchPath = 'd:/Personal_Project/TxtBot-Ai for indian SMBs/taxbot/src';
console.log('Searching for references in src folder...');

walkDir(searchPath, (filePath) => {
  if (filePath.endsWith('.ts')) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('an error occurred while processing')) {
      console.log(`Found error string in: ${filePath}`);
    }
  }
});

console.log('Search complete.');
