const REPO = 'chrisli777/Pipeline-Dashboard';
const BRANCH = 'main';

const FILES = [
  'components/classification-matrix.tsx',
  'components/classification-table.tsx',
  'components/projection-tab.tsx',
  'components/suggestions-tab.tsx',
];

async function fetchFile(path) {
  const url = `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url);
  if (!res.ok) { console.log(`SKIP (${res.status}): ${path}`); return; }
  const json = await res.json();
  const content = Buffer.from(json.content, 'base64').toString('utf8');
  console.log(`===FILE:${path}===`);
  console.log(content);
  console.log(`===END:${path}===`);
}

async function main() {
  for (const f of FILES) {
    await fetchFile(f);
    await new Promise(r => setTimeout(r, 300));
  }
}
main().catch(e => console.error(e));
