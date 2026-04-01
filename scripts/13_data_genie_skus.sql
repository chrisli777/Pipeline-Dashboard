-- ===========================================================================
-- 13: Import Genie SKUs (TJJSH supplier, Kent warehouse)
-- ===========================================================================

-- First, add customer_code column to skus if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'skus' AND column_name = 'customer_code'
  ) THEN
    ALTER TABLE skus ADD COLUMN customer_code TEXT;
  END IF;
END $$;

-- =============================================
-- PART 1: Insert new SKUs
-- =============================================

INSERT INTO skus (id, sku_code, part_model, description, supplier_code, warehouse, customer_code, unit_weight, moq, category)
VALUES
  ('1274333GT', '1274333GT', '1274333GT', 'Tairun Part', 'TJJSH', 'Kent', 'Genie', NULL, 1, 'Genie Parts'),
  ('1284781GT', '1284781GT', '1284781GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 1761.83, 1, 'Genie Parts'),
  ('1287172GT', '1287172GT', '1287172GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 33.44, 1, 'Genie Parts'),
  ('1287173GT', '1287173GT', '1287173GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 33.44, 1, 'Genie Parts'),
  ('1287189GT', '1287189GT', '1287189GT', 'Part', 'TJJSH', 'Kent', 'Genie', 21.27, 1, 'Genie Parts'),
  ('1287190GT', '1287190GT', '1287190GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 21.92, 1, 'Genie Parts'),
  ('1287191GT', '1287191GT', '1287191GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 21.44, 1, 'Genie Parts'),
  ('1287325GT', '1287325GT', '1287325GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 10.22, 1, 'Genie Parts'),
  ('1287329GT', '1287329GT', '1287329GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 9.95, 1, 'Genie Parts'),
  ('1287693GT', '1287693GT', '1287693GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 17.12, 1, 'Genie Parts'),
  ('1288549GT', '1288549GT', '1288549GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 1.62, 1, 'Genie Parts'),
  ('1288550GT', '1288550GT', '1288550GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 0.30, 1, 'Genie Parts'),
  ('1288782GT', '1288782GT', '1288782GT', 'Rosetta Stone Part', 'TJJSH', 'Kent', 'Genie', NULL, 100, 'Genie Parts'),
  ('1288944GT', '1288944GT', '1288944GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 0.77, 1, 'Genie Parts'),
  ('1291397GT', '1291397GT', '1291397GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 1.32, 1, 'Genie Parts'),
  ('1294067GT', '1294067GT', '1294067GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 0.87, 1, 'Genie Parts'),
  ('1294814GT', '1294814GT', '1294814GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 2.18, 1, 'Genie Parts'),
  ('1294839GT', '1294839GT', '1294839GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 2.19, 1, 'Genie Parts'),
  ('1295212GT', '1295212GT', '1295212GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 2.74, 1, 'Genie Parts'),
  ('1296913GT', '1296913GT', '1296913GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 4.13, 1, 'Genie Parts'),
  ('1296914GT', '1296914GT', '1296914GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 3.97, 1, 'Genie Parts'),
  ('1303372GT', '1303372GT', '1303372GT', 'Yong Glory Part', 'TJJSH', 'Kent', 'Genie', 0.06, 1, 'Genie Parts'),
  ('1306370GT', '1306370GT', '1306370GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 56.10, 1, 'Genie Parts'),
  ('214375GT', '214375GT', '214375GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 3.28, 1, 'Genie Parts'),
  ('227164GT', '227164GT', '227164GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 0.57, 1, 'Genie Parts'),
  ('228362GT', '228362GT', '228362GT', 'Kaize Part', 'TJJSH', 'Kent', 'Genie', 0.13, 1, 'Genie Parts')
ON CONFLICT (id) DO UPDATE SET
  supplier_code = EXCLUDED.supplier_code,
  warehouse = EXCLUDED.warehouse,
  customer_code = EXCLUDED.customer_code,
  unit_weight = COALESCE(EXCLUDED.unit_weight, skus.unit_weight),
  moq = COALESCE(EXCLUDED.moq, skus.moq),
  category = EXCLUDED.category,
  updated_at = NOW();


-- =============================================
-- PART 2: Create inventory_data rows for all weeks
-- =============================================

-- Insert inventory_data for each new SKU and each week (1-52)
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
WHERE s.customer_code = 'Genie'
  AND s.supplier_code = 'TJJSH'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_data id 
    WHERE id.sku_id = s.id AND id.week_number = w.week_number
  );


-- =============================================
-- PART 3: Update inventory_dashboard view to include customer_code
-- =============================================

DROP VIEW IF EXISTS inventory_dashboard;
CREATE VIEW inventory_dashboard AS
SELECT
  i.id,
  i.sku_id,
  s.part_model,
  s.description,
  s.category,
  s.supplier_code,
  s.customer_code,
  s.warehouse,
  i.week_number,
  w.week_start_date,
  i.customer_forecast,
  COALESCE(i.actual_consumption, i.customer_forecast) as actual_consumption,
  i.actual_consumption IS NOT NULL as consumption_is_manual,
  CASE
    WHEN i.actual_consumption IS NOT NULL THEN 'manual'
    ELSE 'forecast'
  END as consumption_source,
  i.etd,
  i.eta,
  i.ata,
  i.defect,
  i.actual_inventory,
  CASE
    WHEN COALESCE(i.actual_consumption, i.customer_forecast, 0) = 0 THEN NULL
    ELSE ROUND(i.actual_inventory / NULLIF(COALESCE(i.actual_consumption, i.customer_forecast), 0), 2)
  END as weeks_on_hand
FROM inventory_data i
JOIN skus s ON i.sku_id = s.id
JOIN weeks w ON i.week_number = w.week_number
ORDER BY s.part_model, i.week_number;


-- Grant permissions
GRANT SELECT ON inventory_dashboard TO authenticated;
