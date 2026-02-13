-- Update inventory_dashboard view to include supplier_code
CREATE OR REPLACE VIEW inventory_dashboard AS
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
