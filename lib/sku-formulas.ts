// SKU Formula Configuration
// Defines aggregation formulas for SKUs that combine data from multiple source models

export interface SkuFormula {
  targetSku: string           // The SKU code that receives aggregated data
  displayName: string         // Human-readable name for display (e.g. "Z30/34" instead of "56174GT")
  sourceModels: string[]      // List of model names to sum together (case-insensitive)
  field: 'customer_forecast'  // Which field to aggregate (currently only customer_forecast)
  operation: 'sum'            // Aggregation operation (currently only sum)
}

// Formula definitions
export const SKU_FORMULAS: SkuFormula[] = [
  {
    // WINSCHEM 56174: Sum of Z30N + Z34N + Z34IC + Z34E
    // Note: 56174GT is the SKU code, Z30/34 is the machine model name
    targetSku: '56174GT',
    displayName: 'Z30/34',
    sourceModels: ['Z30N', 'Z34N', 'Z34IC', 'Z34E'],
    field: 'customer_forecast',
    operation: 'sum',
  },
  {
    // PMP 1288133: GS-4655 Counterweight
    targetSku: '1288133GT',
    displayName: 'GS-4655',
    sourceModels: ['GS-4655', 'GS4655'],
    field: 'customer_forecast',
    operation: 'sum',
  },
]

// Model name to SKU mapping (reverse lookup)
// Maps source model names to their target SKU for formula calculations
export const MODEL_TO_SKU_MAP: Record<string, string> = {}

// Build the reverse mapping
for (const formula of SKU_FORMULAS) {
  for (const model of formula.sourceModels) {
    MODEL_TO_SKU_MAP[model.toLowerCase()] = formula.targetSku
  }
}

/**
 * Get the formula for a specific SKU
 */
export function getFormulaForSku(skuCode: string): SkuFormula | undefined {
  return SKU_FORMULAS.find(f => f.targetSku === skuCode)
}

/**
 * Check if a model name is a source for any formula
 */
export function isSourceModel(modelName: string): boolean {
  return modelName.toLowerCase() in MODEL_TO_SKU_MAP
}

/**
 * Get the target SKU for a source model
 */
export function getTargetSkuForModel(modelName: string): string | undefined {
  return MODEL_TO_SKU_MAP[modelName.toLowerCase()]
}
