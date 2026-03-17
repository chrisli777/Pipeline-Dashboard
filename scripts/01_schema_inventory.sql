-- Create SKUs table
CREATE TABLE IF NOT EXISTS skus (
  id TEXT PRIMARY KEY,
  part_model TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'COUNTERWEIGHT',
  supplier_code TEXT DEFAULT 'HX',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create weeks reference table (Week 1-52 with dates)
CREATE TABLE IF NOT EXISTS weeks (
  week_number INTEGER PRIMARY KEY CHECK (week_number >= 1 AND week_number <= 52),
  week_start_date DATE NOT NULL,
  year INTEGER NOT NULL DEFAULT 2026
);

-- Create inventory_data table for storing all weekly data per SKU
CREATE TABLE IF NOT EXISTS inventory_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL REFERENCES weeks(week_number),
  customer_forecast NUMERIC DEFAULT 0,
  actual_consumption NUMERIC DEFAULT NULL, -- NULL means use formula (customer_forecast)
  etd NUMERIC DEFAULT 0,
  ata NUMERIC DEFAULT 0,
  defect NUMERIC DEFAULT 0,
  actual_inventory NUMERIC DEFAULT 0, -- Calculated field, stored for performance
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sku_id, week_number)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_inventory_data_sku_week ON inventory_data(sku_id, week_number);

-- Insert weeks for 2026 (Week 1 starts Dec 30, 2025)
INSERT INTO weeks (week_number, week_start_date, year) VALUES
  (1, '2025-12-29', 2026),
  (2, '2026-01-05', 2026),
  (3, '2026-01-12', 2026),
  (4, '2026-01-19', 2026),
  (5, '2026-01-26', 2026),
  (6, '2026-02-02', 2026),
  (7, '2026-02-09', 2026),
  (8, '2026-02-16', 2026),
  (9, '2026-02-23', 2026),
  (10, '2026-03-02', 2026),
  (11, '2026-03-09', 2026),
  (12, '2026-03-16', 2026),
  (13, '2026-03-23', 2026),
  (14, '2026-03-30', 2026),
  (15, '2026-04-06', 2026),
  (16, '2026-04-13', 2026),
  (17, '2026-04-20', 2026),
  (18, '2026-04-27', 2026),
  (19, '2026-05-04', 2026),
  (20, '2026-05-11', 2026),
  (21, '2026-05-18', 2026),
  (22, '2026-05-25', 2026),
  (23, '2026-06-01', 2026),
  (24, '2026-06-08', 2026),
  (25, '2026-06-15', 2026),
  (26, '2026-06-22', 2026),
  (27, '2026-06-29', 2026),
  (28, '2026-07-06', 2026),
  (29, '2026-07-13', 2026),
  (30, '2026-07-20', 2026),
  (31, '2026-07-27', 2026),
  (32, '2026-08-03', 2026),
  (33, '2026-08-10', 2026),
  (34, '2026-08-17', 2026),
  (35, '2026-08-24', 2026),
  (36, '2026-08-31', 2026),
  (37, '2026-09-07', 2026),
  (38, '2026-09-14', 2026),
  (39, '2026-09-21', 2026),
  (40, '2026-09-28', 2026),
  (41, '2026-10-05', 2026),
  (42, '2026-10-12', 2026),
  (43, '2026-10-19', 2026),
  (44, '2026-10-26', 2026),
  (45, '2026-11-02', 2026),
  (46, '2026-11-09', 2026),
  (47, '2026-11-16', 2026),
  (48, '2026-11-23', 2026),
  (49, '2026-11-30', 2026),
  (50, '2026-12-07', 2026),
  (51, '2026-12-14', 2026),
  (52, '2026-12-21', 2026)
ON CONFLICT (week_number) DO NOTHING;

-- ============================================================
-- SKU Data - All suppliers
-- ============================================================

-- HX Counterweight SKUs
INSERT INTO skus (id, part_model, description, category, supplier_code) VALUES
  ('1272762', '1272762 / T80 (Control Side)', '15.26 sq ft / 970 lbs', 'COUNTERWEIGHT', 'HX'),
  ('1272913', '1272913 / T60 (Engine Side)', '15.26 sq ft / 970 lbs', 'COUNTERWEIGHT', 'HX'),
  ('61415', '61415 / Z80', '17.83 sq ft / 6594 lbs', 'COUNTERWEIGHT', 'HX'),
  ('824433', '824433 / Z62', '19.9 sq ft / 6360 lbs', 'COUNTERWEIGHT', 'HX'),
  ('1282199', '1282199 / HX New', '', 'COUNTERWEIGHT', 'HX')
ON CONFLICT (id) DO UPDATE SET 
  part_model = EXCLUDED.part_model,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  supplier_code = EXCLUDED.supplier_code;

-- AMC Linkset SKUs (GS-4046 E-Drive)
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

-- Function to calculate actual_consumption (uses customer_forecast if NULL)
CREATE OR REPLACE FUNCTION get_actual_consumption(p_actual_consumption NUMERIC, p_customer_forecast NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN COALESCE(p_actual_consumption, p_customer_forecast, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to recalculate inventory for a SKU starting from a specific week
CREATE OR REPLACE FUNCTION recalculate_inventory(p_sku_id UUID, p_start_week INTEGER DEFAULT 1)
RETURNS VOID AS $$
DECLARE
  prev_inventory NUMERIC := 0;
  rec RECORD;
BEGIN
  -- Get the inventory from the week before start_week
  IF p_start_week > 1 THEN
    SELECT actual_inventory INTO prev_inventory
    FROM inventory_data
    WHERE sku_id = p_sku_id AND week_number = p_start_week - 1;
    prev_inventory := COALESCE(prev_inventory, 0);
  END IF;

  -- Loop through all weeks starting from p_start_week and recalculate
  FOR rec IN 
    SELECT id, week_number, customer_forecast, actual_consumption, ata
    FROM inventory_data
    WHERE sku_id = p_sku_id AND week_number >= p_start_week
    ORDER BY week_number
  LOOP
    -- Calculate: prev_inventory - actual_consumption + ata
    prev_inventory := prev_inventory 
      - get_actual_consumption(rec.actual_consumption, rec.customer_forecast)
      + COALESCE(rec.ata, 0);
    
    -- Update the row
    UPDATE inventory_data
    SET actual_inventory = prev_inventory, updated_at = NOW()
    WHERE id = rec.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-recalculate inventory when data changes
CREATE OR REPLACE FUNCTION trigger_recalculate_inventory()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate from the changed week onwards
  PERFORM recalculate_inventory(NEW.sku_id, NEW.week_number);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_recalculate_inventory ON inventory_data;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER trg_recalculate_inventory
AFTER INSERT OR UPDATE OF customer_forecast, actual_consumption, ata, defect
ON inventory_data
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_inventory();

-- Initialize inventory_data for all SKUs and weeks
INSERT INTO inventory_data (sku_id, week_number, customer_forecast, actual_consumption, etd, ata, defect, actual_inventory)
SELECT 
  s.id,
  w.week_number,
  CASE 
    WHEN s.part_model LIKE '%T80%' OR s.part_model LIKE '%T60%' THEN 4
    WHEN s.part_model LIKE '%Z80%' THEN 10
    WHEN s.part_model LIKE '%Z62%' THEN 12
    ELSE 5
  END as customer_forecast,
  NULL as actual_consumption, -- Use formula by default
  0 as etd,
  0 as ata,
  0 as defect,
  CASE 
    WHEN s.part_model LIKE '%T80%' THEN 117 - (w.week_number - 1) * 4
    WHEN s.part_model LIKE '%T60%' THEN 117 - (w.week_number - 1) * 4
    WHEN s.part_model LIKE '%Z80%' THEN 39 - (w.week_number - 1) * 10
    WHEN s.part_model LIKE '%Z62%' THEN 45 - (w.week_number - 1) * 12
    ELSE 50 - (w.week_number - 1) * 5
  END as actual_inventory
FROM skus s
CROSS JOIN weeks w
ON CONFLICT (sku_id, week_number) DO NOTHING;

-- ============================================================
-- Dashboard View - includes supplier_code and calculated fields
-- ============================================================
DROP VIEW IF EXISTS inventory_dashboard;
CREATE VIEW inventory_dashboard AS
SELECT
  i.id,
  i.sku_id,
  s.part_model,
  s.description,
  s.category,
  s.supplier_code,
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
