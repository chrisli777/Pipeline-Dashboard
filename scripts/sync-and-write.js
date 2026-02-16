import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const REPO = 'chrisli777/Pipeline-Dashboard';
const BRANCH = 'main';

const FILES = [
  'lib/types.ts',
  'components/sidebar.tsx',
  'components/pipeline-dashboard.tsx',
  'components/inventory-filters.tsx',
  'components/inventory-table.tsx',
  'components/inventory-alert-bar.tsx',
  'components/sync-dialog.tsx',
  'components/shipment-detail-panel.tsx',
  'components/shipment-status-badge.tsx',
  'components/tracking-status-update.tsx',
  'app/page.tsx',
  'app/shipments/page.tsx',
  'app/api/shipments/route.ts',
  'app/api/shipments/dashboard/route.ts',
  'app/api/shipments/[id]/tracking/route.ts',
  'app/api/shipments/[id]/containers/tracking/route.ts',
  'app/api/shipments/[id]/containers/batch-update/route.ts',
  'app/api/dispatcher/containers/route.ts',
  'app/api/inventory/route.ts',
  'app/api/inventory/in-transit/route.ts',
  'app/api/wms/ata/route.ts',
  'app/api/wms/consumption/route.ts',
  'app/dispatcher/page.tsx',
];

const BASE = '/vercel/share/v0-project';

async function fetchFile(path) {
  const url = `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`SKIP (${res.status}): ${path}`);
      return null;
    }
    const json = await res.json();
    if (json.content) {
      return Buffer.from(json.content, 'base64').toString('utf8');
    }
    return null;
  } catch (e) {
    console.log(`ERROR: ${path} - ${e.message}`);
    return null;
  }
}

async function main() {
  let written = 0;
  // Process in batches of 3 to avoid rate limits
  for (let i = 0; i < FILES.length; i += 3) {
    const batch = FILES.slice(i, i + 3);
    const results = await Promise.all(batch.map(async (f) => {
      const content = await fetchFile(f);
      return { path: f, content };
    }));
    
    for (const { path, content } of results) {
      if (content) {
        const targetPath = `${BASE}/${path}`;
        const dir = dirname(targetPath);
        try {
          mkdirSync(dir, { recursive: true });
          writeFileSync(targetPath, content);
          console.log(`OK: ${path} (${content.length} chars)`);
          written++;
        } catch (e) {
          console.log(`WRITE_FAIL: ${path} - ${e.message}`);
        }
      }
    }
    
    // Small delay between batches
    if (i + 3 < FILES.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  console.log(`\nDone: ${written}/${FILES.length} files written`);
}

main().catch(e => console.error(e));
