-- Fix the inventory recalculation function
-- Week 1's actual_inventory should NOT be recalculated - it's the starting point

-- Drop existing function first to allow parameter name changes
DROP FUNCTION IF EXISTS recalculate_inventory(UUID, INTEGER);

CREATE OR REPLACE FUNCTION recalculate_inventory(p_sku_id UUID, p_start_week INTEGER DEFAULT 1)
RETURNS VOID AS $$
DECLARE
  prev_inventory NUMERIC := 0;
  rec RECORD;
  actual_start_week INTEGER;
BEGIN
  -- Always start from week 2 for recalculation
  -- Week 1 is the starting point and should never be overwritten
  actual_start_week := GREATEST(p_start_week, 2);
  
  -- Get the inventory from week 1 (the starting point)
  SELECT actual_inventory INTO prev_inventory
  FROM inventory_data
  WHERE sku_id = p_sku_id AND week_number = 1;
  prev_inventory := COALESCE(prev_inventory, 0);
  
  -- If we need to start from a week after 2, get the previous week's inventory
  IF actual_start_week > 2 THEN
    SELECT actual_inventory INTO prev_inventory
    FROM inventory_data
    WHERE sku_id = p_sku_id AND week_number = actual_start_week - 1;
    prev_inventory := COALESCE(prev_inventory, 0);
  END IF;

  -- Loop through all weeks starting from actual_start_week and recalculate
  FOR rec IN 
    SELECT id, week_number, customer_forecast, actual_consumption, ata
    FROM inventory_data
    WHERE sku_id = p_sku_id AND week_number >= actual_start_week
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

-- Also update the trigger to skip week 1 updates for actual_inventory
CREATE OR REPLACE FUNCTION trigger_recalculate_inventory()
RETURNS TRIGGER AS $$
BEGIN
  -- Only recalculate for weeks >= 2
  -- Week 1's actual_inventory is manually set and should not be changed
  IF NEW.week_number >= 2 THEN
    PERFORM recalculate_inventory(NEW.sku_id, NEW.week_number);
  ELSIF NEW.week_number = 1 THEN
    -- If week 1 data changes, recalculate from week 2 onwards
    PERFORM recalculate_inventory(NEW.sku_id, 2);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Restore Week 1 inventory data (in case it was overwritten)
UPDATE inventory_data SET actual_inventory = 117 WHERE sku_id = (SELECT id FROM skus WHERE part_model LIKE '%1272762%') AND week_number = 1;
UPDATE inventory_data SET actual_inventory = 117 WHERE sku_id = (SELECT id FROM skus WHERE part_model LIKE '%1272913%') AND week_number = 1;
UPDATE inventory_data SET actual_inventory = 39 WHERE sku_id = (SELECT id FROM skus WHERE part_model LIKE '%61415%') AND week_number = 1;
UPDATE inventory_data SET actual_inventory = 50 WHERE sku_id = (SELECT id FROM skus WHERE part_model LIKE '%824433%') AND week_number = 1;
