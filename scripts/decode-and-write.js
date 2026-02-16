import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// The base64 output from the sync script
const raw = readFileSync('/home/user/github-sync-output.txt', 'utf8');
const lines = raw.split('\n');

let currentFile = null;
let currentBase64 = '';
let filesWritten = 0;

function writeCurrentFile() {
  if (currentFile && currentBase64) {
    const targetPath = `/vercel/share/v0-project/${currentFile}`;
    const dir = dirname(targetPath);
    mkdirSync(dir, { recursive: true });
    const content = Buffer.from(currentBase64, 'base64').toString('utf8');
    writeFileSync(targetPath, content);
    console.log(`Wrote: ${currentFile} (${content.length} bytes)`);
    filesWritten++;
  }
}

for (const line of lines) {
  const match = line.match(/###FILE###(.+?)###BASE64###(.*)$/);
  if (match) {
    // Write previous file if any
    writeCurrentFile();
    currentFile = match[1];
    currentBase64 = match[2].replace(/###END###$/, '');
  } else if (currentFile && line.trim() && !line.startsWith('###FILE###')) {
    // Continuation of base64 (in case it wraps)
    if (line.includes('###END###')) {
      currentBase64 += line.replace('###END###', '');
    } else {
      currentBase64 += line.trim();
    }
  }
}

// Write last file
writeCurrentFile();

console.log(`\nTotal files written: ${filesWritten}`);
