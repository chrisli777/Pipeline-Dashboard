
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
  customerCode: string | null // e.g., "GENIE" or "CLARK"
  supplierCode: string | null // e.g., "HX" or "AMC"
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

// 5-Stage Model
// ON_WATER -> CLEARED -> DELIVERING -> DELIVERED -> CLOSED

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

export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  ON_WATER: ['CLEARED'],
  CLEARED: ['DELIVERING'],
  DELIVERING: ['DELIVERED'],
  DELIVERED: ['CLOSED'],
  CLOSED: [],
}

export const CONTAINER_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  ON_WATER: ['CLEARED'],
  CLEARED: ['DELIVERING'],
  DELIVERING: ['DELIVERED', 'CLEARED'],
  DELIVERED: ['DELIVERING'],
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
  cleared_date: string | null
  delivered_date: string | null
  closed_date: string | null
  duty_amount: number | null
  entry_number: string | null
  broker: string | null
  lfd: string | null
  lfd_extended: string | null
  demurrage_amount: number
  detention_amount: number
  carrier: string | null
  warehouse: string | null
  delivery_reference: string | null
  estimated_warehouse_date: string | null
  wms_receipt_number: string | null
  wms_received_qty: number | null
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

export interface ContainerTracking {
  id: string
  shipment_id: string
  container_number: string
  container_type: string | null
  status: ShipmentStatus
  estimated_warehouse_date: string | null
  picked_up_date: string | null
  scheduled_delivery_date: string | null
  delivered_date: string | null
  carrier: string | null
  warehouse: string | null
  delivery_reference: string | null
  wms_receipt_number: string | null
  wms_received_qty: number | null
  notes: string | null
  status_history: StatusHistoryEntry[]
  created_at: string
  updated_at: string
}

export interface ContainerDispatchView extends ContainerTracking {
  supplier: string
  invoice_number: string
  bol_number: string | null
  etd: string | null
  eta: string | null
  lfd: string | null
  cleared_date: string | null
  duty_amount: number | null
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
  total_containers: number
  containers_cleared: number
  containers_delivering: number
  containers_delivered: number
  amc_active: number
  hx_active: number
  tjjsh_active: number
  clark_active: number
}

export type LfdStatus = 'N/A' | 'RESOLVED' | 'OVERDUE' | 'CRITICAL' | 'WARNING' | 'OK'

export interface SKUClassification {
  id: string
  sku_code: string
  part_model: string | null
  description: string | null
  supplier_code: string | null
  abc_class: 'A' | 'B' | 'C'
  xyz_class: 'X' | 'Y' | 'Z'
  matrix_cell: string
  unit_cost: number | null
  annual_consumption_value: number | null
  avg_weekly_demand: number | null
  cv_demand: number | null
  safety_stock_weeks: number | null
  reorder_point: number | null
  moq: number | null
  lead_time_weeks: number | null
  unit_weight: number | null
  qty_per_container: number | null
  dimensions_cbm: number | null
  length_in: number | null
  width_in: number | null
  height_in: number | null
}

export interface ClassificationPolicy {
  id: string
  matrix_cell: string
  service_level: number
  target_woh: number
  review_frequency: 'weekly' | 'biweekly' | 'monthly'
  replenishment_method: 'auto' | 'manual_review' | 'on_demand'
  safety_stock_multiplier: number
  notes: string | null
}

export interface ClassificationSummary {
  totalSkus: number
  abcCounts: { A: number; B: number; C: number }
  xyzCounts: { X: number; Y: number; Z: number }
  matrixCounts: Record<string, number>
  matrixValues: Record<string, number>
  totalAnnualValue: number
  suppliers: string[]
}

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

export interface SKUClassificationExtended extends SKUClassification {
  service_level: number | null
  target_woh: number | null
  safety_stock_multiplier: number | null
  replenishment_method: 'auto' | 'manual_review' | 'on_demand' | null
  review_frequency: 'weekly' | 'biweekly' | 'monthly' | null
}

export interface InTransitEntry {
  weekNumber: number
  qty: number
}

export interface ProjectionWeek {
  weekNumber: number
  weekStartDate: string
  projectedInventory: number
  demand: number
  inTransitArrival: number
  safetyStock: number
  reorderPoint: number
  targetInventory: number
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'STOCKOUT'
}

export interface SKUProjection {
  skuId: string
  skuCode: string
  partModel: string | null
  supplierCode: string | null
  abcClass: 'A' | 'B' | 'C'
  xyzClass: 'X' | 'Y' | 'Z'
  matrixCell: string
  currentInventory: number
  avgWeeklyDemand: number
  leadTimeWeeks: number
  safetyStock: number
  safetyStockWeeks: number
  reorderPoint: number
  targetInventory: number
  moq: number
  unitCost: number | null
  replenishmentMethod: string
  weeks: ProjectionWeek[]
  stockoutWeek: number | null
  reorderTriggerWeek: number | null
  urgency: 'CRITICAL' | 'WARNING' | 'OK'
  inventoryPosition: number
  totalInTransit: number
  inTransitSchedule: InTransitEntry[]
  demandSource: 'forecast' | 'historical'
  forecastDemand: number | null
}

export interface ReplenishmentSuggestion {
  skuId: string
  skuCode: string
  partModel: string | null
  supplierCode: string | null
  matrixCell: string
  urgency: 'CRITICAL' | 'WARNING' | 'OK'
  replenishmentMethod: string
  suggestedOrderQty: number
  moq: number
  orderDate: string
  expectedArrivalWeek: number
  expectedArrivalDate: string
  currentInventory: number
  projectedAtArrival: number
  safetyStock: number
  targetInventory: number
  avgWeeklyDemand: number
  leadTimeWeeks: number
  weeksOfCover: number
  estimatedCost: number | null
  inventoryPosition: number
  totalInTransit: number
  inTransitSchedule: InTransitEntry[]
  daysOfSupply: number
  stockoutWeek: number | null
  weeksUntilStockout: number | null
  qtyPerContainer: number | null
  estimatedContainers: number | null
  annualConsumptionValue: number | null
  unitWeight: number | null
  totalWeight: number | null
  demandSource: 'forecast' | 'historical'
}

export interface ConsolidatedPO {
  supplierCode: string
  orderDate: string
  expectedArrivalWeek: number
  expectedArrivalDate: string
  items: Array<{
    skuCode: string
    partModel: string | null
    matrixCell: string
    urgency: 'CRITICAL' | 'WARNING' | 'OK'
    suggestedOrderQty: number
    estimatedCost: number | null
    weeksOfCover: number
    containerHint: string | null
  }>
  totalQty: number
  totalCost: number
  totalWeight: number | null
  estimatedContainers: number | null
  skuCount: number
  criticalCount: number
}

export interface ProjectionSummary {
  totalSkus: number
  criticalCount: number
  warningCount: number
  okCount: number
  totalSuggestedOrders: number
  totalSuggestedValue: number
  bySupplier: Record<string, {
    skuCount: number
    criticalCount: number
    suggestedValue: number
  }>
  consolidatedPOs: ConsolidatedPO[]
}

export type RiskType = 'STOCKOUT' | 'BELOW_SAFETY' | 'BELOW_REORDER' | 'LOW_COVER'

export interface RiskItem {
  skuCode: string
  partModel: string | null
  supplierCode: string | null
  matrixCell: string
  riskLevel: 'CRITICAL' | 'WARNING' | 'OK'
  riskType: RiskType
  currentInventory: number
  totalInTransit: number
  inventoryPosition: number
  daysOfSupply: number
  weeksOfCover: number
  demandSource: 'forecast' | 'historical'
  avgWeeklyDemand: number
  stockoutWeek: number | null
  stockoutDate: string | null
  weeksUntilStockout: number | null
  hasPendingOrder: boolean
  orderQty: number | null
  orderArrivalWeek: number | null
  orderArrivalDate: string | null
  estimatedCost: number | null
  mitigationStatus: 'COVERED' | 'PARTIAL' | 'NONE'
  customerImpactNote: string
  actionNote: string
  weekProjections: ProjectionWeek[]
  safetyStock: number
  reorderPoint: number
  targetInventory: number
  leadTimeWeeks: number
}

export interface RiskReport {
  generatedAt: string
  currentWeek: number
  reportWeekLabel: string
  totalSkus: number
  criticalCount: number
  warningCount: number
  okCount: number
  criticalItems: RiskItem[]
  warningItems: RiskItem[]
  okItems: RiskItem[]
  totalPendingOrders: number
  totalOrderValue: number
  unmitigatedRiskCount: number
  aiSummary: string | null
  aiActionItems: string | null
  aiMeetingAgenda: string | null
}
