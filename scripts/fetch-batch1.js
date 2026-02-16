const REPO = 'chrisli777/Pipeline-Dashboard';
const BRANCH = 'main';

const files = [
  'lib/types.ts',
  'components/sidebar.tsx',
  'components/inventory-filters.tsx',
  'components/inventory-alert-bar.tsx',
  'components/shipment-status-badge.tsx',
];

async function main() {
  for (const filePath of files) {
    const url = `https://api.github.com/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3.raw' } });
    if (!res.ok) { console.log(`SKIP: ${filePath}`); continue; }
    const content = await res.text();
    console.log(`===FILE_START:${filePath}===`);
    console.log(content);
    console.log(`===FILE_END:${filePath}===`);
  }
}
main();
