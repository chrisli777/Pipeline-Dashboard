const REPO = 'chrisli777/Pipeline-Dashboard';
const BRANCH = 'main';

const files = [
  'app/shipments/page.tsx',
  'app/dispatcher/page.tsx',
  'app/customer-forecast/page.tsx',
  'app/replenishment/page.tsx',
  'app/api/shipments/route.ts',
  'app/api/shipments/dashboard/route.ts',
  'app/api/shipments/[id]/tracking/route.ts',
  'app/api/shipments/[id]/containers/tracking/route.ts',
  'app/api/shipments/[id]/containers/batch-update/route.ts',
  'app/api/inventory/route.ts',
  'app/api/inventory/update/route.ts',
  'app/api/inventory/in-transit/route.ts',
];

async function main() {
  for (const filePath of files) {
    const url = `https://api.github.com/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
    if (!res.ok) { console.log(`SKIP: ${filePath} (${res.status})`); continue; }
    const json = await res.json();
    if (json.content) {
      const decoded = Buffer.from(json.content, 'base64').toString('utf-8');
      console.log(`===FILE_START:${filePath}===`);
      console.log(decoded);
      console.log(`===FILE_END:${filePath}===`);
    } else {
      console.log(`NO_CONTENT: ${filePath}`);
    }
  }
}
main();
