-- Add customer field to skus table if not present (supplier_code already exists)
-- Update HX SKUs with supplier_code = 'HX'
UPDATE skus SET supplier_code = 'HX' WHERE id IN ('1272762', '1272913', '61415', '824433', '1282199');

-- Add new HX SKU 1282199 if not exists
INSERT INTO skus (id, part_model, description, category, supplier_code)
VALUES ('1282199', '1282199 / HX New', '', 'COUNTERWEIGHT', 'HX')
ON CONFLICT (id) DO UPDATE SET supplier_code = 'HX';

-- Add AMC SKUs (GS-4046 E-Drive linkset)
INSERT INTO skus (id, part_model, description, category, supplier_code) VALUES
  ('132517', '132517 / GS-4046 E-Driv', 'WLDMT,OUTER #1 (Weight: 773.8kg, Qty: 10pcs/Package)', 'LINKSET', 'AMC'),
  ('132383', '132383 / GS-4046 E-Driv', 'WLDMT,OUTER #4, RIGHT (Weight: 1360kg, Qty: 60pcs/Package)', 'LINKSET', 'AMC'),
  ('132385', '132385 / GS-4046 E-Driv', 'WLDMT,OUTER #4, LEFT (Weight: 1360kg, Qty: 60pcs/Package)', 'LINKSET', 'AMC'),
  ('1299483', '1299483 / GS-4046 E-Driv', 'WELDMENT, LOWER LINK XX32.46 (Weight: 1050kg, Qty: 10pcs/Package)', 'LINKSET', 'AMC'),
  ('1264224', '1264224 / GS-4046 E-Driv', 'WLDMT, LNK, INNER #2 NEW (Weight: 1420kg, Qty: 20pcs/Package)', 'LINKSET', 'AMC'),
  ('1260200', '1260200 / GS-4046 E-Driv', 'WLDMT, LNK, INNER #2 (Weight: 1420kg, Qty: 20pcs/Package)', 'LINKSET', 'AMC'),
  ('229579', '229579 / GS-4046 E-Driv', 'WLDMT, LNK, OUTER #2,3,4,5 (Weight: 1735kg, Qty: 50pcs/Package)', 'LINKSET', 'AMC'),
  ('1260307', '1260307 / GS-4046 E-Driv', 'WLDMT,LNK,INNER #3,4046 (Weight: 1242kg, Qty: 8pcs/Package)', 'LINKSET', 'AMC'),
  ('1260198', '1260198 / GS-4046 E-Driv', 'WLDMT,LNK,INNER #5,4046 (Weight: 2240kg, Qty: 20pcs/Package)', 'LINKSET', 'AMC'),
  ('132525', '132525 / GS-4046 E-Driv', 'WLDMT, LNK, INNER #4, 2646 (Weight: 482kg, Qty: 8pcs/Package)', 'LINKSET', 'AMC')
ON CONFLICT (id) DO UPDATE SET 
  part_model = EXCLUDED.part_model,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  supplier_code = EXCLUDED.supplier_code;

-- Initialize inventory_data for all new AMC SKUs (all weeks)
INSERT INTO inventory_data (sku_id, week_number, customer_forecast, actual_consumption, etd, ata, defect, actual_inventory)
SELECT 
  s.id,
  w.week_number,
  0 as customer_forecast,
  NULL as actual_consumption,
  0 as etd,
  0 as ata,
  0 as defect,
  0 as actual_inventory
FROM skus s
CROSS JOIN weeks w
WHERE s.supplier_code = 'AMC'
ON CONFLICT (sku_id, week_number) DO NOTHING;

-- Also initialize for 1282199 HX SKU if new
INSERT INTO inventory_data (sku_id, week_number, customer_forecast, actual_consumption, etd, ata, defect, actual_inventory)
SELECT 
  s.id,
  w.week_number,
  0 as customer_forecast,
  NULL as actual_consumption,
  0 as etd,
  0 as ata,
  0 as defect,
  0 as actual_inventory
FROM skus s
CROSS JOIN weeks w
WHERE s.id = '1282199'
ON CONFLICT (sku_id, week_number) DO NOTHING;
