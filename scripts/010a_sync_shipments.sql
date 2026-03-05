-- Step 1: Delete old shipments that will be replaced by CSV data (different IDs, same logical entity)
-- Then insert all CSV shipments

-- Delete dependent data first for shipments being replaced
DELETE FROM container_tracking WHERE shipment_id IN (
  SELECT id FROM shipments WHERE invoice_number IN (
    'TJLT20260101KZ', 'TJLT20260201KZ',
    'CLARK20251201', 'CLARK20251202', 'CLARK20260101',
    'Terex2025-1201RD', 'Terex2025-1204ML', 'Terex2025-1204RD',
    'Terex2026-0101RD', 'Terex2026-0102RD', 'Terex2026-0103RD',
    'Terex2026-0201ML', 'Terex2026-0203RD'
  )
);
DELETE FROM shipment_containers WHERE shipment_id IN (
  SELECT id FROM shipments WHERE invoice_number IN (
    'TJLT20260101KZ', 'TJLT20260201KZ',
    'CLARK20251201', 'CLARK20251202', 'CLARK20260101',
    'Terex2025-1201RD', 'Terex2025-1204ML', 'Terex2025-1204RD',
    'Terex2026-0101RD', 'Terex2026-0102RD', 'Terex2026-0103RD',
    'Terex2026-0201ML', 'Terex2026-0203RD'
  )
);
DELETE FROM shipment_tracking WHERE shipment_id IN (
  SELECT id FROM shipments WHERE invoice_number IN (
    'TJLT20260101KZ', 'TJLT20260201KZ',
    'CLARK20251201', 'CLARK20251202', 'CLARK20260101',
    'Terex2025-1201RD', 'Terex2025-1204ML', 'Terex2025-1204RD',
    'Terex2026-0101RD', 'Terex2026-0102RD', 'Terex2026-0103RD',
    'Terex2026-0201ML', 'Terex2026-0203RD'
  )
);

-- Delete the old shipments that will be replaced
DELETE FROM shipments WHERE invoice_number IN (
  'TJLT20260101KZ', 'TJLT20260201KZ',
  'CLARK20251201', 'CLARK20251202', 'CLARK20260101',
  'Terex2025-1201RD', 'Terex2025-1204ML', 'Terex2025-1204RD',
  'Terex2026-0101RD', 'Terex2026-0102RD', 'Terex2026-0103RD',
  'Terex2026-0201ML', 'Terex2026-0203RD'
);

-- Also delete stale duplicate: BL142503419969
DELETE FROM container_tracking WHERE shipment_id = 'bcd34aee-2281-4e80-9fc4-17aa691496a4';
DELETE FROM shipment_containers WHERE shipment_id = 'bcd34aee-2281-4e80-9fc4-17aa691496a4';
DELETE FROM shipment_tracking WHERE shipment_id = 'bcd34aee-2281-4e80-9fc4-17aa691496a4';
DELETE FROM shipments WHERE id = 'bcd34aee-2281-4e80-9fc4-17aa691496a4';

-- Now upsert all 32 shipments from CSV (some exist with same ID, some are new)
INSERT INTO shipments (id, invoice_number, bol_number, supplier, customer, etd, eta, container_count, sku_count, total_value, total_weight, po_numbers, incoterm, currency, folder_name, data_completeness, tenant_id)
VALUES
('01d826a7-6be5-4904-b0bd-e312107edcd5','Terex2026-0104RD','MEDUWA518481','HX','Genie','2026-01-26','2026-02-25',1,1,22232.00,14794.00,'["739"]','EXW','USD','Terex2026-0104RD','complete','whi'),
('0211443b-cf7c-4434-b7a4-0182d695ad3b','25112801','COSU6437079380','AMC','Genie','2025-12-08','2026-01-07',10,9,211252.32,66997.48,'["700"]','EXW','USD','25112801','complete','whi'),
('079ff066-1945-48b8-9fd2-978046644ff2','Terex2026-0101ML','SMLMTAYH5D536200','HX','Genie','2026-01-01','2026-01-31',2,2,38460.55,33585.00,'["740"]','EXW','USD','Terex2026-0101ML','complete','whi'),
('0fb89251-5566-4d46-91fc-82a9c3419264','Terex2026-0203ML','HDMUTAOZ05384500','HX','Genie','2026-02-15','2026-03-17',2,2,51006.40,33585.00,'["747"]','EXW','USD','Terex2026-0203ML','complete','whi'),
('2a623137-6722-4cf3-bbf6-56a57099fb58','Terex2026-0104ML','MEDUWA518499','HX','Genie','2026-01-26','2026-02-25',2,2,51006.40,33585.00,'["740"]','EXW','USD','Terex2026-0104ML','complete','whi'),
('477aa587-b5b8-4592-be70-96aa6d7b9e1c','Terex2026-0201RD','HDMUTAOZ76143100','HX','Genie','2026-02-03','2026-03-05',1,1,22232.00,14794.00,'["746"]','EXW','USD','Terex2026-0201RD','complete','whi'),
('496cf48f-ec35-4929-9ca6-129257810e77','CLARK20251201  2小 ETD12.4','TAO25110071','HX','Clark','2025-12-04','2026-01-03',2,5,20136.38,24503.00,'["8801HX-0000716","8801HX-0000686"]','EXW','USD','CLARK20251201  2小 ETD12.4','complete','whi'),
('519f3a98-fe86-480c-893d-b64f183bf323','Terex2026-0102ML','HDMUTAOZ75797000','HX','Genie','2026-01-10','2026-02-09',2,2,51006.40,33585.00,'["740"]','EXW','USD','Terex2026-0102ML','complete','whi'),
('5255c4f5-1d79-4fcc-96dd-76778cddc464','25120601','EGLV142503671901','AMC','Genie','2025-12-10','2026-01-09',2,2,55958.10,18795.00,'["714"]','EXW','USD','25120601','complete','whi'),
('58ad7073-cae1-4659-9517-54a2f2ccfd51','Terex2025-1202','SMLMTAYH5D512300','HX','Genie','2025-12-09','2026-01-08',2,2,50636.70,33000.00,'["730"]','EXW','USD','Terex2025-1202','complete','whi'),
('626ec7c1-1024-40d4-93c3-bc3f4fbf18ef','Terex2026-0201ML','HDMUTAOZ30523500','HX','Genie','2026-02-03','2026-03-05',2,2,51006.40,33585.00,'["747"]','EXW','USD','Terex2026-0201ML','complete','whi'),
('6385225f-4b2c-43a8-975d-aa4a7e405038','Terex2025-1204','HDMUTAOZ82714300','HX','Genie','2025-12-21','2026-01-20',2,2,50636.70,33585.00,'["730"]','EXW','USD','Terex2025-1204','complete','whi'),
('651a69c3-9817-4658-ae3c-01df240f16b8','Terex2025-1202A','ONEYTAOFM7066800','HX','Genie','2025-12-06','2026-01-05',0,1,22086.56,0.00,'["729"]','EXW','USD','Terex2025-1202A','partial (missing: container)','whi'),
('66dc802e-e16f-4622-beda-e6e55ec0e75b','Terex2025-1203','HDMUTAOZ91196400','HX','Genie','2025-12-13','2026-01-12',0,2,63778.90,0.00,'["730","740"]','EXW','USD','Terex2025-1203','partial (missing: container)','whi'),
('6dc78103-76db-4dc8-bf78-fc56bae7f748','25111501','EGLV142503419969','AMC','Genie','2025-11-19','2025-12-19',2,2,55958.10,18795.00,'["699"]','EXW','USD','25111501','complete','whi'),
('6de4bc2a-5a3c-46c0-ae9f-c700d57c4229','CLARK20251202  1小 ETD12.24','TAO25110078','HX','Clark','2025-12-24','2026-01-23',1,6,9529.32,12001.00,'["8801HX-0000716","8801HX-0000725"]','EXW','USD','CLARK20251202  1小 ETD12.24','complete','whi'),
('808ff92b-d224-4b3d-8b97-236b0ca1b3df','Terex2026-0203RD','HDMUTAOZ00637500','HX','Genie','2026-02-16','2026-03-18',1,1,22232.00,14794.00,'["746"]','EXW','USD','Terex2026-0203RD','complete','whi'),
('83b1c8b1-4e05-49a4-90b3-2e361967ae70','Terex2025-1203A','ONEYTAOFM8248400','HX','Genie','2025-12-14','2026-01-13',0,1,22086.56,0.00,'["729"]','EXW','USD','Terex2025-1203A','partial (missing: container)','whi'),
('85947c9f-e720-443b-be96-812acb81569d','Terex2026-0102RD','HDMUTAOZ28489500','HX','Genie','2026-01-10','2026-02-09',1,1,22232.00,14794.00,'["739"]','EXW','USD','Terex2026-0102RD','complete','whi'),
('88626c66-b755-4549-ae03-ea6d26411cdb','Terex2026-0103RD','MEDUWA301623','HX','Genie','2026-01-23','2026-02-22',1,1,22232.00,14794.00,'["739"]','EXW','USD','Terex2026-0103RD','complete','whi'),
('8905adeb-4267-449c-8500-b1dbe0e3e759','Terex2026-0103ML','HDMUTAOZ23975700','HX','Genie','2026-01-21','2026-02-20',2,2,38743.15,33585.00,'["740"]','EXW','USD','Terex2026-0103ML','complete','whi'),
('9d3482ad-6e86-4102-8632-8f734d59d98d','Terex2025-1205A','HDMUTAOZ94972300','HX','Genie','2025-12-28','2026-01-27',0,1,24352.30,0.00,'["740"]','EXW','USD','Terex2025-1205A','partial (missing: container)','whi'),
('9e09219b-b83b-4770-86f9-a37ba14f543e','TJLT20260101KZ','FA2985','TJJSH','Genie','2026-01-16','2026-02-15',1,10,7692.40,1753.02,'["TJJSH-0000737"]','EXW','USD','TJLT20260101KZ','complete','whi'),
('b4f6f64c-21cd-429c-960a-3be92060dd81','CLARK20260101  3小 ETD1.26','TAO25120076','HX','Clark','2026-01-26','2026-02-25',3,7,29430.85,28683.00,'["8801HX-0000716","8801HX-0000686"]','EXW','USD','CLARK20260101  3小 ETD1.26','complete','whi'),
('c00fd89e-c00e-4103-a8f6-3526694eb446','Terex2026-0202ML','HDMUTAOZ54243300','HX','Genie','2026-02-07','2026-03-09',2,2,64246.35,33585.00,'["747"]','EXW','USD','Terex2026-0202ML','complete','whi'),
('c0776f41-676d-434e-b5c3-15f7058e648b','Terex2025-1201A','HDMUTAOZ97037500','HX','Genie','2025-12-06','2026-01-05',0,1,22086.56,0.00,'["729"]','EXW','USD','Terex2025-1201A','partial (missing: container)','whi'),
('c6c3f21f-bf3c-4931-a141-177cbcaf73da','Terex2026-0202RD','HDMUTAOZ05944000','HX','Genie','2026-02-07','2026-03-09',1,1,33348.00,14794.00,'["746"]','EXW','USD','Terex2026-0202RD','complete','whi'),
('dbfec9b7-3ed4-4bca-8ec1-f017be9168c3','TJLT20260201KZ','FA3215','TJJSH','Genie','2026-01-30','2026-03-01',1,18,27541.80,6464.56,'["TJJSH-0000737"]','EXW','USD','TJLT20260201KZ','complete','whi'),
('e308508a-0c1d-43d0-8694-d62cd0a68fb8','Terex2025-1204A','HDMUTAOZ98935400','HX','Genie','2025-12-21','2026-01-20',0,1,22086.56,0.00,'["729"]','EXW','USD','Terex2025-1204A','partial (missing: container)','whi'),
('ecc94738-8857-4f62-8420-29765163250b','Terex2026-0101RD','HDMUTAOZ03038500','HX','Genie','2026-01-04','2026-02-03',1,1,22232.00,14794.00,'["729"]','EXW','USD','Terex2026-0101RD','complete','whi'),
('ef972476-f543-4fe2-81c6-7f79b343c7db','Terex2025-1205','HDMUTAOZ40444000','HX','Genie','2025-12-28','2026-01-27',0,2,62812.85,0.00,'["730","740"]','EXW','USD','Terex2025-1205','partial (missing: container)','whi'),
('fa07267a-d9fe-4189-bd4d-d8bf90f92753','26012301','EGLV142600024043','AMC','Genie','2026-01-28','2026-02-27',16,10,444920.90,141397.60,'["720","718"]','EXW','USD','26012301','complete','whi')
ON CONFLICT (id) DO UPDATE SET
  invoice_number = EXCLUDED.invoice_number,
  bol_number = EXCLUDED.bol_number,
  supplier = EXCLUDED.supplier,
  customer = EXCLUDED.customer,
  etd = EXCLUDED.etd,
  eta = EXCLUDED.eta,
  container_count = EXCLUDED.container_count,
  sku_count = EXCLUDED.sku_count,
  total_value = EXCLUDED.total_value,
  total_weight = EXCLUDED.total_weight,
  po_numbers = EXCLUDED.po_numbers,
  incoterm = EXCLUDED.incoterm,
  currency = EXCLUDED.currency,
  folder_name = EXCLUDED.folder_name,
  data_completeness = EXCLUDED.data_completeness;
