import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const DATA_DIR = '/vercel/share/v0-project/scripts/data';

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];
  
  // Parse header
  const headers = [];
  let headerLine = lines[0];
  let inQuote = false;
  let field = '';
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { headers.push(field.trim()); field = ''; continue; }
    field += ch;
  }
  headers.push(field.trim());

  // Parse rows
  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    if (!line.trim()) continue;
    const values = [];
    inQuote = false;
    field = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { values.push(field); field = ''; continue; }
      field += ch;
    }
    values.push(field);
    
    const row = {};
    headers.forEach((h, idx) => {
      let val = (values[idx] || '').trim();
      if (val === '' || val === 'null' || val === 'NULL') val = null;
      row[h] = val;
    });
    rows.push(row);
  }
  return rows;
}

function cleanNumeric(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function cleanInt(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

function cleanDate(val) {
  if (val === null || val === undefined || val === '') return null;
  return val;
}

function cleanArray(val) {
  if (val === null || val === undefined || val === '') return null;
  // CSV arrays come as {val1,val2}
  if (val.startsWith('{') && val.endsWith('}')) {
    return val.slice(1, -1).split(',').map(v => v.trim().replace(/"/g, ''));
  }
  return [val];
}

function cleanJson(val) {
  if (val === null || val === undefined || val === '') return null;
  try { return JSON.parse(val); } catch { return null; }
}

async function upsertBatch(table, rows, conflictCol, batchSize = 50) {
  console.log(`Upserting ${rows.length} rows into ${table}...`);
  let success = 0;
  let errors = 0;
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictCol });
    
    if (error) {
      console.error(`  Batch ${Math.floor(i/batchSize)+1} error:`, error.message);
      // Try one by one
      for (const row of batch) {
        const { error: singleErr } = await supabase
          .from(table)
          .upsert(row, { onConflict: conflictCol });
        if (singleErr) {
          console.error(`  Row error (${row.id || row.container_number}):`, singleErr.message);
          errors++;
        } else {
          success++;
        }
      }
    } else {
      success += batch.length;
    }
  }
  console.log(`  Done: ${success} success, ${errors} errors`);
}

async function main() {
  console.log('=== Upserting shipment data ===\n');

  // 1. Shipments
  const shipments = parseCSV(`${DATA_DIR}/shipments_rows.csv`).map(r => ({
    id: r.id, invoice_number: r.invoice_number, bol_number: r.bol_number,
    supplier: r.supplier, customer: r.customer,
    etd: cleanDate(r.etd), eta: cleanDate(r.eta),
    actual_departure: cleanDate(r.actual_departure), actual_arrival: cleanDate(r.actual_arrival),
    container_count: cleanInt(r.container_count), sku_count: cleanInt(r.sku_count),
    total_value: cleanNumeric(r.total_value), total_weight: cleanNumeric(r.total_weight),
    total_volume: cleanNumeric(r.total_volume),
    po_numbers: cleanArray(r.po_numbers),
    incoterm: r.incoterm, currency: r.currency, folder_name: r.folder_name,
    notes: r.notes, data_completeness: r.data_completeness, tenant_id: r.tenant_id,
  }));
  await upsertBatch('shipments', shipments, 'id');

  // 2. Shipment tracking
  const tracking = parseCSV(`${DATA_DIR}/shipment_tracking_rows.csv`).map(r => ({
    id: r.id, shipment_id: r.shipment_id, status: r.status,
    carrier: r.carrier, broker: r.broker, warehouse: r.warehouse,
    shipped_date: cleanDate(r.shipped_date), departed_date: cleanDate(r.departed_date),
    arrived_port_date: cleanDate(r.arrived_port_date), cleared_date: cleanDate(r.cleared_date),
    picked_up_date: cleanDate(r.picked_up_date), delivered_date: cleanDate(r.delivered_date),
    closed_date: cleanDate(r.closed_date), scheduled_date: cleanDate(r.scheduled_date),
    estimated_warehouse_date: cleanDate(r.estimated_warehouse_date),
    lfd: cleanDate(r.lfd), lfd_extended: cleanDate(r.lfd_extended),
    entry_number: r.entry_number,
    duty_amount: cleanNumeric(r.duty_amount), demurrage_amount: cleanNumeric(r.demurrage_amount),
    detention_amount: cleanNumeric(r.detention_amount),
    delivery_reference: r.delivery_reference, wms_receipt_number: r.wms_receipt_number,
    wms_received_qty: cleanInt(r.wms_received_qty),
    notes: r.notes, status_history: cleanJson(r.status_history), tenant_id: r.tenant_id,
  }));
  await upsertBatch('shipment_tracking', tracking, 'id');

  // 3. Shipment containers
  const containers = parseCSV(`${DATA_DIR}/shipment_containers_rows.csv`).map(r => ({
    id: r.id, shipment_id: r.shipment_id,
    container_number: r.container_number, container_type: r.container_type,
    seal_number: r.seal_number, sku: r.sku, sku_description: r.sku_description,
    po_number: r.po_number,
    quantity: cleanInt(r.quantity), unit_price: cleanNumeric(r.unit_price),
    total_amount: cleanNumeric(r.total_amount),
    gross_weight: cleanNumeric(r.gross_weight), net_weight: cleanNumeric(r.net_weight),
    tenant_id: r.tenant_id,
  }));
  await upsertBatch('shipment_containers', containers, 'id');

  // 4. Container tracking - upsert on id, update status for matching container_number
  const ctTracking = parseCSV(`${DATA_DIR}/container_tracking_rows.csv`).map(r => ({
    id: r.id, shipment_id: r.shipment_id, container_id: r.container_id,
    container_number: r.container_number, container_type: r.container_type,
    status: r.status, carrier: r.carrier, warehouse: r.warehouse,
    scheduled_delivery_date: cleanDate(r.scheduled_delivery_date),
    estimated_warehouse_date: cleanDate(r.estimated_warehouse_date),
    picked_up_date: cleanDate(r.picked_up_date), delivered_date: cleanDate(r.delivered_date),
    delivery_reference: r.delivery_reference, wms_receipt_number: r.wms_receipt_number,
    wms_received_qty: cleanInt(r.wms_received_qty),
    notes: r.notes, status_history: cleanJson(r.status_history),
  }));
  await upsertBatch('container_tracking', ctTracking, 'id');

  console.log('\n=== All done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
