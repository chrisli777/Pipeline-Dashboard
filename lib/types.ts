export interface WeekData {
  weekNumber: number
  weekOf: string // e.g., "31-Dec", "7-Jan"
  customerForecast: number | null
  actualConsumption: number | null
  etd: number | null // ETD (departure from origin)
  eta: number | null // ETA (arrival to warehouse)
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
  stockoutWeekNumber: number  // The week when stockout is predicted
  stockoutWeekOf: string
  reorderByWeekNumber: number // 12 weeks before stockout = reorder deadline
  reorderByWeekOf: string
  weeksUntilStockout: number  // How many weeks from now until stockout
}

export type RowType = 
  | 'customerForecast'
  | 'actualConsumption'
  | 'etd'
  | 'ata'
  | 'defect'
  | 'actualInventory'
  | 'weeksOnHand'

export const ROW_LABELS: Record<RowType, string> = {
  customerForecast: 'Customer Forecast',
  actualConsumption: 'Actual Consumption',
  etd: 'ETD (departure from origin)',
  eta: 'ATA (arrival to warehouse)',
  defect: 'Defect',
  actualInventory: 'Actual inventory on hand',
  weeksOnHand: 'Weeks on hand (actual / runout)',
}
