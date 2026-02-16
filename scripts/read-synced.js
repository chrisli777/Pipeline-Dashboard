import { readFileSync, existsSync } from 'fs';

const TMP_BASE = '/tmp/github-sync';
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

// Print just the first file to check if /tmp persists
const testPath = `${TMP_BASE}/${FILES[0]}`;
if (existsSync(testPath)) {
  console.log('TMP FILES EXIST - can read them');
  // Print each file with delimiters
  for (const f of FILES) {
    const fullPath = `${TMP_BASE}/${f}`;
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8');
      console.log(`===FILE:${f}===`);
      console.log(content);
      console.log(`===END:${f}===`);
    }
  }
} else {
  console.log('TMP FILES DO NOT EXIST - need to re-fetch');
}
