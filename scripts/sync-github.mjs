// Fetch files from GitHub main branch and write to local filesystem
// Uses the GitHub API to get base64-encoded file content (preserves JSX)

const REPO = 'chrisli777/Pipeline-Dashboard';
const BRANCH = 'main';

// Files that differ between v0 and GitHub main branch
// Only sync non-UI custom files (skip components/ui/*)
const FILES_TO_SYNC = [
  // Types
  'lib/types.ts',
  
  // Components
  'components/sidebar.tsx',
  'components/pipeline-dashboard.tsx',
  'components/inventory-filters.tsx',
  'components/inventory-table.tsx',
  'components/inventory-alert-bar.tsx',
  'components/sync-dialog.tsx',
  'components/shipment-detail-panel.tsx',
  'components/shipment-status-badge.tsx',
  'components/tracking-status-update.tsx',
  'components/ai-chat.tsx',
  'components/classification-matrix.tsx',
  'components/classification-table.tsx',
  'components/projection-detail-chart.tsx',
  'components/projection-sparkline.tsx',
  'components/projection-tab.tsx',
  'components/risk-analysis-tab.tsx',
  'components/suggestions-tab.tsx',
  'components/theme-provider.tsx',
  
  // Pages
  'app/page.tsx',
  'app/layout.tsx',
  'app/globals.css',
  'app/shipments/page.tsx',
  'app/dispatcher/page.tsx',
  'app/customer-forecast/page.tsx',
  'app/replenishment/page.tsx',
  
  // API routes
  'app/api/shipments/route.ts',
  'app/api/shipments/dashboard/route.ts',
  'app/api/shipments/[id]/route.ts',
  'app/api/shipments/[id]/tracking/route.ts',
  'app/api/shipments/[id]/deliver/route.ts',
  'app/api/shipments/[id]/containers/tracking/route.ts',
  'app/api/shipments/[id]/containers/batch-update/route.ts',
  'app/api/shipments/[id]/containers/[containerNumber]/tracking/route.ts',
  'app/api/dispatcher/containers/route.ts',
  'app/api/inventory/route.ts',
  'app/api/inventory/update/route.ts',
  'app/api/inventory/rollover/route.ts',
  'app/api/inventory/in-transit/route.ts',
  'app/api/wms/ata/route.ts',
  'app/api/wms/consumption/route.ts',
  'app/api/chat/route.ts',
  'app/api/forecast-files/route.ts',
  'app/api/forecast-files/[id]/route.ts',
  'app/api/sync/customer-forecast/route.ts',
  'app/api/replenishment/classification/route.ts',
  'app/api/replenishment/classification/policies/route.ts',
  'app/api/replenishment/projection/route.ts',
  'app/api/replenishment/suggestions/route.ts',
  'app/api/reports/weekly-risk/route.ts',
];

async function fetchFile(filePath) {
  const url = `https://api.github.com/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) {
      console.log(`[SKIP] ${filePath} - ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    console.log(`[WARN] ${filePath} - not base64 encoded`);
    return null;
  } catch (err) {
    console.log(`[ERROR] ${filePath} - ${err.message}`);
    return null;
  }
}

import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

async function main() {
  let synced = 0;
  let failed = 0;
  
  for (const filePath of FILES_TO_SYNC) {
    const content = await fetchFile(filePath);
    if (content !== null) {
      const fullPath = `/vercel/share/v0-project/${filePath}`;
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');
      console.log(`[OK] ${filePath} (${content.length} chars)`);
      synced++;
    } else {
      failed++;
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\nDone: ${synced} synced, ${failed} skipped/failed`);
}

main();
