import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Read the raw output from the sync script
const raw = readFileSync('/home/user/github-sync-raw.txt', 'utf-8');

const fileRegex = /===FILE:(.+?)===\n([\s\S]*?)===END:\1===/g;
let match;
let count = 0;

while ((match = fileRegex.exec(raw)) !== null) {
  const filePath = match[1];
  const content = match[2];
  const outPath = `/home/user/extracted/${filePath}`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, 'utf-8');
  console.log(`[OK] ${filePath} (${content.length} chars)`);
  count++;
}

console.log(`\nExtracted ${count} files to /home/user/extracted/`);
