import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const DATA_DIR = '/vercel/share/v0-project/scripts/data';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    // Handle commas inside quotes
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    const row = {};
    headers.forEach((h, i) => {
      const key = h.trim();
      let val = (values[i] || '').trim();
      if (val === '') val = null;
      row[key] = val;
    });
    return row;
  });
}

function cleanRow(row, numericFields = [], jsonFields = [], arrayFields = []) {
  const cleaned = { ...row };
  for (const key of numericFields) {
    if (cleaned[key] !== null && cleaned[key] !== undefined) {
      const n = Number(cleaned[key]);
      cleaned[key] = isNaN(n) ? null : n;
    }
  }
  for (const key of jsonFields) {
    if (cleaned[key] && typeof cleaned[key] === 'string') {
      try {
        cleaned[key] = JSON.parse(cleaned[key]);
      } catch {
        cleaned[key] = null;
      }
    }
  }
  for (const key of arrayFields) {
    if (cleaned[key] && typeof cleaned[key] === 'string') {
      try {
        cleaned[key] = JSON.parse(cleaned[key]);
      } catch {
        cleaned[key] = null;
      }
    }
  }
  return cleaned;
}

async function upsertBatch(table, rows, conflictColumn = 'id', batchSize = 50) {
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictColumn })
      .select();
    
    if (error) {
      console.error(`  Error in ${table} batch ${i / batchSize + 1}:`, error.message);
      errors += batch.length;
    } else {
      inserted += data?.length || 0;
    }
  }
  
  console.log(`  ${table}: ${inserted} rows upserted, ${errors} errors`);
  return { inserted, errors };
}

async function main() {
  console.log('=== Upsert Shipment Data to Supabase ===\n');
  
  // 1. Shipments
  console.log('1. Processing shipments...');
  const shipments = parseCSV(path.join(DATA_DIR, 'shipments_rows.csv'));
  const cleanedShipments = shipments.map(r => cleanRow(r, 
    ['container_count', 'sku_count', 'total_value', 'total_weight', 'total_volume'],
    [],
    ['po_numbers']
  ));
  await upsertBatch('shipments', cleanedShipments);
  
  // 2. Shipment Tracking
  console.log('2. Processing shipment_tracking...');
  const tracking = parseCSV(path.join(DATA_DIR, 'shipment_tracking_rows.csv'));
  const cleanedTracking = tracking.map(r => cleanRow(r,
    ['duty_amount', 'demurrage_amount', 'detention_amount', 'wms_received_qty'],
    ['status_history'],
    []
  ));
  await upsertBatch('shipment_tracking', cleanedTracking);
  
  // 3. Shipment Containers
  console.log('3. Processing shipment_containers...');
  const containers = parseCSV(path.join(DATA_DIR, 'shipment_containers_rows.csv'));
  const cleanedContainers = containers.map(r => cleanRow(r,
    ['quantity', 'unit_price', 'total_amount', 'gross_weight', 'net_weight'],
    [],
    []
  ));
  await upsertBatch('shipment_containers', cleanedContainers);
  
  // 4. Container Tracking (upsert on id, update status if container_number matches)
  console.log('4. Processing container_tracking...');
  const ctTracking = parseCSV(path.join(DATA_DIR, 'container_tracking_rows.csv'));
  const cleanedCtTracking = ctTracking.map(r => cleanRow(r,
    ['wms_received_qty'],
    ['status_history'],
    []
  ));
  await upsertBatch('container_tracking', cleanedCtTracking);
  
  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
