-- Create temp table without FK constraints
CREATE TEMP TABLE tmp_shipment_containers (LIKE shipment_containers INCLUDING ALL);
ALTER TABLE tmp_shipment_containers DROP CONSTRAINT IF EXISTS tmp_shipment_containers_shipment_id_fkey;

-- Insert all data into temp table (this will succeed even with missing shipment_ids)
INSERT INTO tmp_shipment_containers ("id", "shipment_id", "container_number", "container_type", "seal_number", "sku", "sku_description", "po_number", "quantity", "unit_price", "total_amount", "gross_weight", "net_weight", "tenant_id")
SELECT * FROM tmp_shipment_containers WHERE false; -- placeholder, will be replaced

-- Now insert only rows whose shipment_id exists in shipments
INSERT INTO shipment_containers
SELECT t.* FROM tmp_shipment_containers t
WHERE t.shipment_id IN (SELECT id FROM shipments)
ON CONFLICT (id) DO NOTHING;

DROP TABLE tmp_shipment_containers;
