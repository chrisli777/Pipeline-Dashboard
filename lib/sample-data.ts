import type { SKUData, WeekData } from './types'

// Generate weeks for the entire year 2026
export const generateWeeksForYear = (): { weekNumber: number; weekOf: string }[] => {
  const weeks: { weekNumber: number; weekOf: string }[] = []
  const startDate = new Date(2025, 11, 29) // Dec 29, 2025 (Week 1 starts around here)
  
  for (let i = 0; i < 52; i++) {
    const currentDate = new Date(startDate)
    currentDate.setDate(startDate.getDate() + i * 7)
    
    const day = currentDate.getDate()
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = monthNames[currentDate.getMonth()]
    
    weeks.push({
      weekNumber: i + 1,
      weekOf: `${day}-${month}`
    })
  }
  
  return weeks
}

// Generate sample week data
const generateWeekData = (baseInventory: number, avgForecast: number, hasIssues: boolean = false): WeekData[] => {
  const weeks = generateWeeksForYear()
  let inventory = baseInventory
  
  return weeks.map((week, idx) => {
    const forecast = avgForecast + Math.floor(Math.random() * 4) - 2
    const consumption = avgForecast + Math.floor(Math.random() * 4) - 2
    const etd = idx % 3 === 0 ? Math.floor(Math.random() * 15) + 5 : 0
    const eta = idx % 4 === 0 ? Math.floor(Math.random() * 15) + 5 : 0
    const defect = idx < 3 && hasIssues ? Math.floor(Math.random() * 30) + 20 : null
    
    inventory = inventory - consumption + eta
    if (hasIssues && idx > 15) {
      inventory = Math.max(inventory - 5, -15)
    }
    
    const weeksOnHand = forecast > 0 ? inventory / forecast : inventory > 0 ? 99 : 0
    
    return {
      weekNumber: week.weekNumber,
      weekOf: week.weekOf,
      customerForecast: forecast > 0 ? forecast : 0,
      actualConsumption: consumption > 0 ? consumption : 0,
      etd: etd > 0 ? etd : null,
      eta: eta > 0 ? eta : null,
      defect,
      actualInventory: inventory,
      weeksOnHand: parseFloat(weeksOnHand.toFixed(2))
    }
  })
}

export const sampleSKUs: SKUData[] = [
  {
    id: 'sku-1',
    partModelNumber: '1272762 / T80 (Control Side)',
    description: '(15.26 sq ft / 970 lbs)',
    category: 'COUNTERWEIGHT',
    weeks: generateWeekData(117, 4, true)
  },
  {
    id: 'sku-2',
    partModelNumber: '1272913 / T60 (Engine Side)',
    description: '(15.26 sq ft / 970 lbs)',
    category: 'COUNTERWEIGHT',
    weeks: generateWeekData(117, 4, false)
  },
  {
    id: 'sku-3',
    partModelNumber: '61415 / Z80',
    description: '(17.83 sq ft / 6594 lbs)',
    category: 'COUNTERWEIGHT',
    weeks: generateWeekData(39, 10, true)
  },
  {
    id: 'sku-4',
    partModelNumber: '824433 / Z62',
    description: '(19.9 sq ft / 6360 lbs)',
    category: 'COUNTERWEIGHT',
    weeks: generateWeekData(45, 12, true)
  },
]
