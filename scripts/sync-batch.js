// Fetch files from GitHub and print as JSON array
// Each element: { path: "...", content: "..." }
// The content is double-base64 encoded so it survives output parsing

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
];

async function main() {
  for (const filePath of FILES) {
    const url = `https://api.github.com/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`;
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!res.ok) {
        console.error(`[SKIP] ${filePath}`);
        continue;
      }
      const data = await res.json();
      // GitHub already gives us base64 content
      // Print path and raw base64 (no decoding, no JSX stripping)
      console.log(`###FILE###${filePath}###BASE64###${data.content.replace(/\n/g, '')}###END###`);
    } catch (err) {
      console.error(`[ERROR] ${filePath}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 80));
  }
}

main();
