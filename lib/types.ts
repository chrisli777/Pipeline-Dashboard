export interface WeekData {
  weekNumber: number
  weekOf: string // e.g., "31-Dec", "7-Jan"
  customerForecast: number | null
  actualConsumption: number | null
  etd: number | null // ETD (departure from origin)
  eta: number | null // ETA (arrival to warehouse)
  inTransit: number | null // In-transit quantity (on water)
  inTransitInvoices?: string[] // tooltip: which invoices
  defect: number | null
  actualInventory: number | null
  weeksOnHand: number | null
}

export interface SKUData {
  id: string
  partModelNumber: string // e.g., "1272762 / T80 (Control Side)"
  description: string // e.g., "(15.26 sq ft / 970 lbs)"
  category: string // e.g., "COUNTERWEIGHT"
  weeks: WeekData[]
}

export interface InventoryAlert {
  skuId: string
  partModelNumber: string
  weekNumber: number
  weekOf: string
  weeksOnHand: number
  severity: 'critical' | 'warning' | 'low'
}

export type RowType =
  | 'customerForecast'
  | 'actualConsumption'
  | 'etd'
  | 'ata'
  | 'inTransit'
  | 'defect'
  | 'actualInventory'
  | 'weeksOnHand'

export const ROW_LABELS: Record<RowType, string> = {
  customerForecast: 'Customer Forecast',
  actualConsumption: 'Actual Consumption',
  etd: 'ETD (departure from origin)',
  ata: 'ATA (arrival to warehouse)',
  inTransit: 'In Transit (on water)',
  defect: 'Defect',
  actualInventory: 'Actual inventory on hand',
  weeksOnHand: 'Weeks on hand (actual / runout)',
}

// ═══════════════════════════════════════════
// Shipment Tracking Types — 5-Stage Model
// ON_WATER → CLEARED → DELIVERING → DELIVERED → CLOSED
// ═══════════════════════════════════════════

export type ShipmentStatus =
  | 'ON_WATER'
  | 'CLEARED'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'CLOSED'

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  ON_WATER: 'On Water',
  CLEARED: 'Customs Cleared',
  DELIVERING: 'Delivering',
  DELIVERED: 'Delivered',
  CLOSED: 'Closed',
}

export const SHIPMENT_STATUS_ORDER: ShipmentStatus[] = [
  'ON_WATER',
  'CLEARED',
  'DELIVERING',
  'DELIVERED',
  'CLOSED',
]

// Valid status transitions at the shipment level
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  ON_WATER: ['CLEARED'],
  CLEARED: ['DELIVERING'], // actually driven by container-level
  DELIVERING: ['DELIVERED'], // auto-derived from containers
  DELIVERED: ['CLOSED'],
  CLOSED: [],
}

// Valid status transitions at the container level
export const CONTAINER_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  ON_WATER: ['CLEARED'],
  CLEARED: ['DELIVERING'],
  DELIVERING: ['DELIVERED', 'CLEARED'], // allow revert to CLEARED
  DELIVERED: ['DELIVERING'], // allow revert to DELIVERING
  CLOSED: [],
}

export interface Shipment {
  id: string
  supplier: string
  invoice_number: string
  bol_number: string | null
  folder_name: string | null
  etd: string | null
  eta: string | null
  actual_departure: string | null
  actual_arrival: string | null
  container_count: number
  sku_count: number
  total_value: number
  total_weight: number
  po_numbers: string[]
  created_at: string
  updated_at: string
}

export interface ShipmentContainer {
  id: string
  shipment_id: string
  container_number: string | null
  container_type: string | null
  sku: string
  sku_description: string | null
  po_number: string | null
  quantity: number
  unit_price: number | null
  total_amount: number | null
  gross_weight: number | null
}

export interface ShipmentTracking {
  id: string
  shipment_id: string
  status: ShipmentStatus
  // Key dates
  cleared_date: string | null
  delivered_date: string | null
  closed_date: string | null
  // Customs & clearance
  duty_amount: number | null
  entry_number: string | null
  broker: string | null
  lfd: string | null
  lfd_extended: string | null
  demurrage_amount: number
  detention_amount: number
  // Delivery (shipment-level, for backward compat)
  carrier: string | null
  warehouse: string | null
  delivery_reference: string | null
  estimated_warehouse_date: string | null
  // WMS
  wms_receipt_number: string | null
  wms_received_qty: number | null
  // Audit
  status_history: StatusHistoryEntry[]
  notes: string | null
  created_at: string
  updated_at: string
}

export interface StatusHistoryEntry {
  from_status?: string
  to_status: string
  changed_at: string
  changed_by?: string
  notes?: string
}

// ═══════════════════════════════════════════
// Container-Level Tracking Types
// ═══════════════════════════════════════════

export interface ContainerTracking {
  id: string
  shipment_id: string
  container_number: string
  container_type: string | null
  status: ShipmentStatus
  // Dispatcher fields
  estimated_warehouse_date: string | null
  picked_up_date: string | null
  scheduled_delivery_date: string | null
  delivered_date: string | null
  carrier: string | null
  warehouse: string | null
  delivery_reference: string | null
  // WMS
  wms_receipt_number: string | null
  wms_received_qty: number | null
  // Audit
  notes: string | null
  status_history: StatusHistoryEntry[]
  created_at: string
  updated_at: string
}

// Container from the v_container_dispatch view (includes shipment info)
export interface ContainerDispatchView extends ContainerTracking {
  // From shipment join
  supplier: string
  invoice_number: string
  bol_number: string | null
  etd: string | null
  eta: string | null
  lfd: string | null
  cleared_date: string | null
  duty_amount: number | null
  // Aggregated SKU info
  sku_summary: Array<{
    sku: string
    po_number: string | null
    quantity: number
    total_amount: number | null
  }> | null
  total_quantity: number
}

export interface ShipmentWithTracking extends Shipment {
  tracking: ShipmentTracking | null
  containers?: ShipmentContainer[]
}

export interface ShipmentDashboardStats {
  on_water_count: number
  cleared_count: number
  delivering_count: number
  delivered_count: number
  active_shipments: number
  lfd_critical_count: number
  arriving_this_week: number
  total_value_in_transit: number
  // Container-level stats
  total_containers: number
  containers_cleared: number
  containers_delivering: number
  containers_delivered: number
  // Supplier breakdown
  amc_active: number
  hx_active: number
  tjjsh_active: number
  clark_active: number
}

export type LfdStatus = 'N/A' | 'RESOLVED' | 'OVERDUE' | 'CRITICAL' | 'WARNING' | 'OK'

export interface ShipmentOverview extends Shipment {
  status: ShipmentStatus | null
  lfd: string | null
  lfd_extended: string | null
  cleared_date: string | null
  delivered_date: string | null
  carrier: string | null
  warehouse: string | null
  duty_amount: number | null
  days_since_eta: number | null
  days_to_lfd: number | null
  lfd_status: LfdStatus
}
