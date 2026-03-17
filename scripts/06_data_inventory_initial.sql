-- Restore Week 1 Actual Inventory data
UPDATE inventory_data SET actual_inventory = 117 WHERE sku_id = '1272762' AND week_number = 1;
UPDATE inventory_data SET actual_inventory = 117 WHERE sku_id = '1272913' AND week_number = 1;
UPDATE inventory_data SET actual_inventory = 39 WHERE sku_id = '61415' AND week_number = 1;
UPDATE inventory_data SET actual_inventory = 50 WHERE sku_id = '824433' AND week_number = 1;

-- Restore Actual Consumption data for weeks -3, -2, -1, 0 (before Week 1, not displayed)
-- SKU 1272762: 2, 1, 0, 0
UPDATE inventory_data SET actual_consumption = 2 WHERE sku_id = '1272762' AND week_number = -3;
UPDATE inventory_data SET actual_consumption = 1 WHERE sku_id = '1272762' AND week_number = -2;
UPDATE inventory_data SET actual_consumption = 0 WHERE sku_id = '1272762' AND week_number = -1;
UPDATE inventory_data SET actual_consumption = 0 WHERE sku_id = '1272762' AND week_number = 0;

-- SKU 1272913: 2, 1, 0, 0
UPDATE inventory_data SET actual_consumption = 2 WHERE sku_id = '1272913' AND week_number = -3;
UPDATE inventory_data SET actual_consumption = 1 WHERE sku_id = '1272913' AND week_number = -2;
UPDATE inventory_data SET actual_consumption = 0 WHERE sku_id = '1272913' AND week_number = -1;
UPDATE inventory_data SET actual_consumption = 0 WHERE sku_id = '1272913' AND week_number = 0;

-- SKU 61415: 3, 3, 4, 0
UPDATE inventory_data SET actual_consumption = 3 WHERE sku_id = '61415' AND week_number = -3;
UPDATE inventory_data SET actual_consumption = 3 WHERE sku_id = '61415' AND week_number = -2;
UPDATE inventory_data SET actual_consumption = 4 WHERE sku_id = '61415' AND week_number = -1;
UPDATE inventory_data SET actual_consumption = 0 WHERE sku_id = '61415' AND week_number = 0;

-- SKU 824433: 4, 3, 1, 0
UPDATE inventory_data SET actual_consumption = 4 WHERE sku_id = '824433' AND week_number = -3;
UPDATE inventory_data SET actual_consumption = 3 WHERE sku_id = '824433' AND week_number = -2;
UPDATE inventory_data SET actual_consumption = 1 WHERE sku_id = '824433' AND week_number = -1;
UPDATE inventory_data SET actual_consumption = 0 WHERE sku_id = '824433' AND week_number = 0;
