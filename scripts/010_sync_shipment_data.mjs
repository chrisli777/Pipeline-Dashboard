import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',')
  return lines.slice(1).map(line => {
    // Handle CSV fields that may contain commas inside quotes
    const values = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes
      } else if (line[i] === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += line[i]
      }
    }
    values.push(current.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h.trim()] = values[i] || '' })
    return obj
  })
}

async function main() {
  console.log('--- Syncing shipment data from CSVs ---')

  // Read CSVs from user_read_only_context
  const shipmentsCSV = readFileSync(resolve('user_read_only_context/text_attachments/shipments_rows-PHIuL.csv'), 'utf-8')
  const containerTrackingCSV = readFileSync(resolve('user_read_only_context/text_attachments/container_tracking_rows-8XeFJ.csv'), 'utf-8')
  const shipmentContainersCSV = readFileSync(resolve('user_read_only_context/text_attachments/shipment_containers_rows-8jOSB.csv'), 'utf-8')
  const shipmentTrackingCSV = readFileSync(resolve('user_read_only_context/text_attachments/shipment_tracking_rows-1PnsV.csv'), 'utf-8')

  const csvShipments = parseCSV(shipmentsCSV)
  const csvContainerTracking = parseCSV(containerTrackingCSV)
  const csvShipmentContainers = parseCSV(shipmentContainersCSV)
  const csvShipmentTracking = parseCSV(shipmentTrackingCSV)

  console.log(`CSV: ${csvShipments.length} shipments, ${csvContainerTracking.length} container_tracking, ${csvShipmentContainers.length} shipment_containers, ${csvShipmentTracking.length} shipment_tracking`)

  // Build CSV shipment_id -> invoice_number map
  const csvIdToInvoice = {}
  for (const s of csvShipments) {
    csvIdToInvoice[s.id] = s.invoice_number
  }

  // Get all DB shipments
  const { data: dbShipments, error: dbErr } = await supabase
    .from('shipments')
    .select('id, invoice_number')
  
  if (dbErr) { console.error('DB error:', dbErr); process.exit(1) }

  // Build invoice_number -> DB id map
  const invoiceToDbId = {}
  for (const s of dbShipments) {
    invoiceToDbId[s.invoice_number] = s.id
  }

  // Also build CSV id -> DB id map
  const csvIdToDbId = {}
  for (const s of csvShipments) {
    const dbId = invoiceToDbId[s.invoice_number]
    if (dbId) {
      csvIdToDbId[s.id] = dbId
    }
  }

  // ---- Step 1: Update shipments with correct data ----
  console.log('\n--- Step 1: Updating shipments ---')
  let updatedShipments = 0
  for (const csv of csvShipments) {
    const dbId = invoiceToDbId[csv.invoice_number]
    if (!dbId) {
      // New shipment - insert it
      console.log(`  NEW: ${csv.invoice_number} - inserting`)
      const { error } = await supabase.from('shipments').insert({
        id: csv.id,
        invoice_number: csv.invoice_number,
        bol_number: csv.bol_number || null,
        supplier: csv.supplier || null,
        customer: csv.customer || null,
        etd: csv.etd || null,
        eta: csv.eta || null,
        container_count: parseInt(csv.container_count) || 0,
        sku_count: parseInt(csv.sku_count) || 0,
        total_value: parseFloat(csv.total_value) || 0,
        total_weight: parseFloat(csv.total_weight) || 0,
        po_numbers: csv.po_numbers || null,
        incoterm: csv.incoterm || null,
        currency: csv.currency || null,
        folder_name: csv.folder_name || null,
        data_completeness: csv.data_completeness || null,
        tenant_id: csv.tenant_id || 'whi',
      })
      if (error) console.error(`  INSERT error for ${csv.invoice_number}:`, error.message)
      else { csvIdToDbId[csv.id] = csv.id; updatedShipments++ }
      continue
    }

    // Update existing
    const updateData = {
      bol_number: csv.bol_number || null,
      supplier: csv.supplier || null,
      customer: csv.customer || null,
      etd: csv.etd || null,
      eta: csv.eta || null,
      container_count: parseInt(csv.container_count) || 0,
      sku_count: parseInt(csv.sku_count) || 0,
      total_value: parseFloat(csv.total_value) || 0,
      total_weight: parseFloat(csv.total_weight) || 0,
      po_numbers: csv.po_numbers || null,
      incoterm: csv.incoterm || null,
      currency: csv.currency || null,
      folder_name: csv.folder_name || null,
      data_completeness: csv.data_completeness || null,
    }
    const { error } = await supabase.from('shipments').update(updateData).eq('id', dbId)
    if (error) console.error(`  UPDATE error for ${csv.invoice_number}:`, error.message)
    else updatedShipments++
  }
  console.log(`  Updated ${updatedShipments} shipments`)

  // ---- Step 2: Sync container_tracking ----
  console.log('\n--- Step 2: Syncing container_tracking ---')
  
  // Get affected DB shipment IDs
  const affectedDbIds = [...new Set(
    csvContainerTracking
      .map(ct => csvIdToDbId[ct.shipment_id])
      .filter(Boolean)
  )]
  
  if (affectedDbIds.length > 0) {
    // Delete old container_tracking for these shipments
    const { error: delErr } = await supabase
      .from('container_tracking')
      .delete()
      .in('shipment_id', affectedDbIds)
    if (delErr) console.error('  DELETE error:', delErr.message)
    else console.log(`  Deleted old container_tracking for ${affectedDbIds.length} shipments`)
  }

  // Insert new container_tracking with mapped DB shipment IDs
  let insertedCT = 0
  for (const ct of csvContainerTracking) {
    const dbShipmentId = csvIdToDbId[ct.shipment_id]
    if (!dbShipmentId) {
      console.log(`  SKIP CT: no DB shipment for CSV shipment_id ${ct.shipment_id}`)
      continue
    }
    const { error } = await supabase.from('container_tracking').insert({
      id: ct.id,
      shipment_id: dbShipmentId,
      container_id: ct.container_id || null,
      container_number: ct.container_number,
      container_type: ct.container_type || null,
      status: ct.status || 'ON_WATER',
      carrier: ct.carrier || null,
      warehouse: ct.warehouse || null,
    })
    if (error) console.error(`  INSERT CT error for ${ct.container_number}:`, error.message)
    else insertedCT++
  }
  console.log(`  Inserted ${insertedCT} container_tracking rows`)

  // ---- Step 3: Sync shipment_containers ----
  console.log('\n--- Step 3: Syncing shipment_containers ---')
  
  // Delete old shipment_containers for affected shipments
  if (affectedDbIds.length > 0) {
    const { error: delErr } = await supabase
      .from('shipment_containers')
      .delete()
      .in('shipment_id', affectedDbIds)
    if (delErr) console.error('  DELETE error:', delErr.message)
    else console.log(`  Deleted old shipment_containers for affected shipments`)
  }

  // Insert new shipment_containers with mapped DB shipment IDs  
  let insertedSC = 0
  for (const sc of csvShipmentContainers) {
    const dbShipmentId = csvIdToDbId[sc.shipment_id]
    if (!dbShipmentId) continue
    const { error } = await supabase.from('shipment_containers').insert({
      id: sc.id,
      shipment_id: dbShipmentId,
      container_number: sc.container_number || null,
      container_type: sc.container_type || null,
      seal_number: sc.seal_number || null,
      sku: sc.sku || null,
      sku_description: sc.sku_description || null,
      po_number: sc.po_number || null,
      quantity: parseInt(sc.quantity) || 0,
      unit_price: parseFloat(sc.unit_price) || 0,
      total_amount: parseFloat(sc.total_amount) || 0,
      gross_weight: parseFloat(sc.gross_weight) || 0,
      net_weight: parseFloat(sc.net_weight) || null,
      tenant_id: sc.tenant_id || 'whi',
    })
    if (error) console.error(`  INSERT SC error:`, error.message)
    else insertedSC++
  }
  console.log(`  Inserted ${insertedSC} shipment_containers rows`)

  // ---- Step 4: Sync shipment_tracking ----
  console.log('\n--- Step 4: Syncing shipment_tracking ---')
  
  if (affectedDbIds.length > 0) {
    const { error: delErr } = await supabase
      .from('shipment_tracking')
      .delete()
      .in('shipment_id', affectedDbIds)
    if (delErr) console.error('  DELETE error:', delErr.message)
    else console.log(`  Deleted old shipment_tracking for affected shipments`)
  }

  let insertedST = 0
  for (const st of csvShipmentTracking) {
    const dbShipmentId = csvIdToDbId[st.shipment_id]
    if (!dbShipmentId) continue
    const { error } = await supabase.from('shipment_tracking').insert({
      id: st.id,
      shipment_id: dbShipmentId,
      status: st.status || 'ON_WATER',
      carrier: st.carrier || null,
      broker: st.broker || null,
      warehouse: st.warehouse || null,
      shipped_date: st.shipped_date || null,
      departed_date: st.departed_date || null,
      tenant_id: st.tenant_id || 'whi',
    })
    if (error) console.error(`  INSERT ST error:`, error.message)
    else insertedST++
  }
  console.log(`  Inserted ${insertedST} shipment_tracking rows`)

  // ---- Step 5: Fix double-serialized status_history ----
  console.log('\n--- Step 5: Fixing status_history ---')
  const { error: fixErr } = await supabase.rpc('exec_sql', {
    sql: `UPDATE shipment_tracking SET status_history = (status_history #>> '{}')::jsonb WHERE jsonb_typeof(status_history) = 'string'`
  })
  if (fixErr) console.log('  status_history fix via rpc failed (may not have rpc), skipping')
  else console.log('  Fixed double-serialized status_history')

  console.log('\n--- Done! ---')
}

main().catch(console.error)
