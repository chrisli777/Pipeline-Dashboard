-- ===========================================================================
-- 14: Import Winschem SKUs (Kent warehouse, Genie customer)
-- ===========================================================================

-- =============================================
-- PART 1: Insert/Update SKU
-- =============================================

INSERT INTO skus (id, sku_code, part_model, description, supplier_code, warehouse, customer_code, unit_weight, moq, category)
VALUES
  ('56174GT', '56174GT', '56174 / Z30N+Z34N+Z34IC+Z34E', 'Mini Slab - BELLCRANK MACHINING (22.09LBS)', 'WINSCHEM', 'Kent', 'Genie', 22.09, 1, 'Genie Parts')
ON CONFLICT (id) DO UPDATE SET
  sku_code = EXCLUDED.sku_code,
  part_model = EXCLUDED.part_model,
  description = EXCLUDED.description,
  supplier_code = EXCLUDED.supplier_code,
  warehouse = EXCLUDED.warehouse,
  customer_code = EXCLUDED.customer_code,
  unit_weight = COALESCE(EXCLUDED.unit_weight, skus.unit_weight),
  moq = COALESCE(EXCLUDED.moq, skus.moq),
  category = EXCLUDED.category,
  updated_at = NOW();


-- =============================================
-- PART 2: Create inventory_data rows for all weeks (if not exists)
-- =============================================

INSERT INTO inventory_data (sku_id, week_number, customer_forecast, actual_consumption, etd, eta, ata, defect, actual_inventory)
SELECT 
  s.id as sku_id,
  w.week_number,
  0 as customer_forecast,
  NULL as actual_consumption,
  0 as etd,
  NULL as eta,
  0 as ata,
  0 as defect,
  0 as actual_inventory
FROM skus s
CROSS JOIN weeks w
WHERE s.sku_code = '56174GT'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_data id 
    WHERE id.sku_id = s.id AND id.week_number = w.week_number
  );
