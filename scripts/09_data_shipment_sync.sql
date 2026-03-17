-- Sync shipment data from CSV exports
-- Updates: shipments (bol_number, eta, etd, etc.), container_tracking, shipment_containers

-- 1. Update shipments table with correct BOL, ETA, ETD values
-- The CSV has 32 shipments with correct data. We update matching records by id.

UPDATE shipments SET bol_number = 'MEDUWA518481', eta = '2026-02-25', etd = '2026-01-26', supplier = 'HX', customer = 'Genie', container_count = 1 WHERE id = '01d826a7-6be5-4904-b0bd-e312107edcd5';
UPDATE shipments SET bol_number = 'COSU6437079380', eta = '2026-01-07', etd = '2025-12-08', supplier = 'AMC', customer = 'Genie', container_count = 10 WHERE id = '0211443b-cf7c-4434-b7a4-0182d695ad3b';
UPDATE shipments SET bol_number = 'SMLMTAYH5D536200', eta = '2026-01-31', etd = '2026-01-01', supplier = 'HX', customer = 'Genie', container_count = 2 WHERE id = '079ff066-1945-48b8-9fd2-978046644ff2';
UPDATE shipments SET bol_number = 'HDMUTAOZ05384500', eta = '2026-03-17', etd = '2026-02-15', supplier = 'HX', customer = 'Genie', container_count = 2 WHERE id = '0fb89251-5566-4d46-91fc-82a9c3419264';
UPDATE shipments SET bol_number = 'MEDUWA518499', eta = '2026-02-25', etd = '2026-01-26', supplier = 'HX', customer = 'Genie', container_count = 2 WHERE id = '2a623137-6722-4cf3-bbf6-56a57099fb58';
UPDATE shipments SET bol_number = 'HDMUTAOZ76143100', eta = '2026-03-05', etd = '2026-02-03', supplier = 'HX', customer = 'Genie', container_count = 1 WHERE id = '477aa587-b5b8-4592-be70-96aa6d7b9e1c';
UPDATE shipments SET bol_number = 'TAO25110071', eta = '2026-01-03', etd = '2025-12-04', supplier = 'HX', customer = 'Clark', container_count = 2 WHERE id = '496cf48f-ec35-4929-9ca6-129257810e77';
UPDATE shipments SET bol_number = 'HDMUTAOZ75797000', eta = '2026-02-09', etd = '2026-01-10', supplier = 'HX', customer = 'Genie', container_count = 2 WHERE id = '519f3a98-fe86-480c-893d-b64f183bf323';
UPDATE shipments SET bol_number = 'EGLV142503671901', eta = '2026-01-09', etd = '2025-12-10', supplier = 'AMC', customer = 'Genie', container_count = 2 WHERE id = '5255c4f5-1d79-4fcc-96dd-76778cddc464';
UPDATE shipments SET bol_number = 'SMLMTAYH5D512300', eta = '2026-01-08', etd = '2025-12-09', supplier = 'HX', customer = 'Genie', container_count = 2 WHERE id = '58ad7073-cae1-4659-9517-54a2f2ccfd51';
UPDATE shipments SET bol_number = 'HDMUTAOZ30523500', eta = '2026-03-05', etd = '2026-02-03', supplier = 'HX', customer = 'Genie', container_count = 2 WHERE id = '626ec7c1-1024-40d4-93c3-bc3f4fbf18ef';
UPDATE shipments SET bol_number = 'HDMUTAOZ82714300', eta = '2026-01-20', etd = '2025-12-21', supplier = 'HX', customer = 'Genie', container_count = 2 WHERE id = '6385225f-4b2c-43a8-975d-aa4a7e405038';
UPDATE shipments SET bol_number = 'ONEYTAOFM7066800', eta = '2026-01-05', etd = '2025-12-06', supplier = 'HX', customer = 'Genie', container_count = 0 WHERE id = '651a69c3-9817-4658-ae3c-01df240f16b8';
UPDATE shipments SET bol_number = 'HDMUTAOZ91196400', eta = '2026-01-12', etd = '2025-12-13', supplier = 'HX', customer = 'Genie', container_count = 0 WHERE id = '66dc802e-e16f-4622-beda-e6e55ec0e75b';
UPDATE shipments SET bol_number = 'EGLV142503419969', eta = '2025-12-19', etd = '2025-11-19', supplier = 'AMC', customer = 'Genie', container_count = 2 WHERE id = '6dc78103-76db-4dc8-bf78-fc56bae7f748';
UPDATE shipments SET bol_number = 'TAO25110078', eta = '2026-01-23', etd = '2025-12-24', supplier = 'HX', customer = 'Clark', container_count = 1 WHERE id = '6de4bc2a-5a3c-46c0-ae9f-c700d57c4229';
UPDATE shipments SET bol_number = 'HDMUTAOZ00637500', eta = '2026-03-18', etd = '2026-02-16', supplier = 'HX', customer = 'Genie', container_count = 1 WHERE id = '808ff92b-d224-4b3d-8b97-236b0ca1b3df';
UPDATE shipments SET bol_number = 'ONEYTAOFM8248400', eta = '2026-01-13', etd = '2025-12-14', supplier = 'HX', customer = 'Genie', container_count = 0 WHERE id = '83b1c8b1-4e05-49a4-90b3-2e361967ae70';
UPDATE shipments SET bol_number = 'HDMUTAOZ28489500', eta = '2026-02-09', etd = '2026-01-10', supplier = 'HX', customer = 'Genie', container_count = 1 WHERE id = '85947c9f-e720-443b-be96-812acb81569d';
UPDATE shipments SET bol_number = 'MEDUWA301623', eta = '2026-02-22', etd = '2026-01-23', supplier = 'HX', customer = 'Genie', container_count = 1 WHERE id = '88626c66-b755-4549-ae03-ea6d26411cdb';
UPDATE shipments SET bol_number = 'HDMUTAOZ23975700', eta = '2026-02-20', etd = '2026-01-21', supplier = 'HX', customer = 'Genie', container_count = 2 WHERE id = '8905adeb-4267-449c-8500-b1dbe0e3e759';
UPDATE shipments SET bol_number = 'HDMUTAOZ94972300', eta = '2026-01-27', etd = '2025-12-28', supplier = 'HX', customer = 'Genie', container_count = 0 WHERE id = '9d3482ad-6e86-4102-8632-8f734d59d98d';
UPDATE shipments SET bol_number = 'FA2985', eta = '2026-02-15', etd = '2026-01-16', supplier = 'TJJSH', customer = 'Genie', container_count = 1 WHERE id = '9e09219b-b83b-4770-86f9-a37ba14f543e';
UPDATE shipments SET bol_number = 'TAO25120076', eta = '2026-02-25', etd = '2026-01-26', supplier = 'HX', customer = 'Clark', container_count = 3 WHERE id = 'b4f6f64c-21cd-429c-960a-3be92060dd81';
UPDATE shipments SET bol_number = 'HDMUTAOZ54243300', eta = '2026-03-09', etd = '2026-02-07', supplier = 'HX', customer = 'Genie', container_count = 2 WHERE id = 'c00fd89e-c00e-4103-a8f6-3526694eb446';
UPDATE shipments SET bol_number = 'HDMUTAOZ97037500', eta = '2026-01-05', etd = '2025-12-06', supplier = 'HX', customer = 'Genie', container_count = 0 WHERE id = 'c0776f41-676d-434e-b5c3-15f7058e648b';
UPDATE shipments SET bol_number = 'HDMUTAOZ05944000', eta = '2026-03-09', etd = '2026-02-07', supplier = 'HX', customer = 'Genie', container_count = 1 WHERE id = 'c6c3f21f-bf3c-4931-a141-177cbcaf73da';
UPDATE shipments SET bol_number = 'FA3215', eta = '2026-03-01', etd = '2026-01-30', supplier = 'TJJSH', customer = 'Genie', container_count = 1 WHERE id = 'dbfec9b7-3ed4-4bca-8ec1-f017be9168c3';
UPDATE shipments SET bol_number = 'HDMUTAOZ98935400', eta = '2026-01-20', etd = '2025-12-21', supplier = 'HX', customer = 'Genie', container_count = 0 WHERE id = 'e308508a-0c1d-43d0-8694-d62cd0a68fb8';
UPDATE shipments SET bol_number = 'HDMUTAOZ03038500', eta = '2026-02-03', etd = '2026-01-04', supplier = 'HX', customer = 'Genie', container_count = 1 WHERE id = 'ecc94738-8857-4f62-8420-29765163250b';
UPDATE shipments SET bol_number = 'HDMUTAOZ40444000', eta = '2026-01-27', etd = '2025-12-28', supplier = 'HX', customer = 'Genie', container_count = 0 WHERE id = 'ef972476-f543-4fe2-81c6-7f79b343c7db';
UPDATE shipments SET bol_number = 'EGLV142600024043', eta = '2026-02-27', etd = '2026-01-28', supplier = 'AMC', customer = 'Genie', container_count = 16 WHERE id = 'fa07267a-d9fe-4189-bd4d-d8bf90f92753';

-- 2. Delete old container_tracking rows for these shipments and re-insert with correct data
-- First delete existing container_tracking rows for the shipments we have in the CSV
DELETE FROM container_tracking WHERE shipment_id IN (
  '0211443b-cf7c-4434-b7a4-0182d695ad3b',
  'fa07267a-d9fe-4189-bd4d-d8bf90f92753',
  '58ad7073-cae1-4659-9517-54a2f2ccfd51',
  '8905adeb-4267-449c-8500-b1dbe0e3e759',
  '079ff066-1945-48b8-9fd2-978046644ff2',
  '0fb89251-5566-4d46-91fc-82a9c3419264',
  '2a623137-6722-4cf3-bbf6-56a57099fb58',
  '477aa587-b5b8-4592-be70-96aa6d7b9e1c',
  '496cf48f-ec35-4929-9ca6-129257810e77',
  '519f3a98-fe86-480c-893d-b64f183bf323',
  '5255c4f5-1d79-4fcc-96dd-76778cddc464',
  '626ec7c1-1024-40d4-93c3-bc3f4fbf18ef',
  '6385225f-4b2c-43a8-975d-aa4a7e405038',
  '6dc78103-76db-4dc8-bf78-fc56bae7f748',
  '6de4bc2a-5a3c-46c0-ae9f-c700d57c4229',
  '808ff92b-d224-4b3d-8b97-236b0ca1b3df',
  '85947c9f-e720-443b-be96-812acb81569d',
  '88626c66-b755-4549-ae03-ea6d26411cdb',
  'b4f6f64c-21cd-429c-960a-3be92060dd81',
  'c00fd89e-c00e-4103-a8f6-3526694eb446',
  'c6c3f21f-bf3c-4931-a141-177cbcaf73da',
  'dbfec9b7-3ed4-4bca-8ec1-f017be9168c3',
  '9e09219b-b83b-4770-86f9-a37ba14f543e',
  '01d826a7-6be5-4904-b0bd-e312107edcd5',
  'ecc94738-8857-4f62-8420-29765163250b'
);

-- Insert correct container_tracking data from CSV
INSERT INTO container_tracking (id, shipment_id, container_id, container_number, container_type, status, carrier, warehouse) VALUES
('00450f4c-d8c9-408e-826b-4e2d4397db2f','0211443b-cf7c-4434-b7a4-0182d695ad3b','94ff1e3e-11b3-4bb5-96b1-e2704cb65d2a','SLEU2500362','20GP','ON_WATER','CVAS','Kent'),
('068b0c02-264d-470f-bd57-52323199ac39','fa07267a-d9fe-4189-bd4d-d8bf90f92753','0489e674-8bbe-41d7-8757-554e7b162c81','EGSU1439329','40HQ','ON_WATER','CVAS','Kent'),
('0883bff9-8672-4ead-8a77-78cbb0ee1b14','fa07267a-d9fe-4189-bd4d-d8bf90f92753','e4689acd-7d81-4748-acaf-391a1fa4d94a','TIIU5653194','40HQ','ON_WATER','CVAS','Kent'),
('09156b38-0f01-479e-a3cc-c3abe771b673','8905adeb-4267-449c-8500-b1dbe0e3e759','4f074b6f-bde3-4466-8224-8bfd4b7e1038','TLLU2586237','20GP','ON_WATER','CVAS','Kent'),
('0b06f16f-eb1f-4289-8cff-26c0fdefad14','fa07267a-d9fe-4189-bd4d-d8bf90f92753','81ce9242-72ea-44e9-b0ae-2680ecde456a','EMCU1526698','40HQ','ON_WATER','CVAS','Kent'),
('0bafaee9-135b-4e57-974b-ab53f80fe6c7','fa07267a-d9fe-4189-bd4d-d8bf90f92753','e61caa06-ad34-4598-b506-f60ce75d299a','VPLU3220068','20GP','ON_WATER','CVAS','Kent'),
('0d9beac6-a8c4-4361-8a2a-11edc5522610','58ad7073-cae1-4659-9517-54a2f2ccfd51','d79eb369-bb0a-4fcf-8fe0-c67a7d5cc45e','TEMU1632471','20GP','ON_WATER','CVAS','Kent'),
('15b7d6e2-02e3-496a-a08b-47070eee3c97','fa07267a-d9fe-4189-bd4d-d8bf90f92753','9758e482-84e2-4ad8-84a0-cd0c87c5f960','EISU9464661','40HQ','ON_WATER','CVAS','Kent'),
('20506a2f-1914-4720-b186-d7c3eef992e9','fa07267a-d9fe-4189-bd4d-d8bf90f92753','48f33a0e-64da-4d7e-b372-96bea254f46d','VPLU3220052','20GP','ON_WATER','CVAS','Kent'),
('218d0935-6ef7-4312-9474-fe37a15520d1','9e09219b-b83b-4770-86f9-a37ba14f543e','5526f4fd-9711-4878-8f75-29aec5eb36a7','MSMU3961625','20GP','ON_WATER','CVAS','Kent'),
('265855ae-6c55-4855-85c1-b95728b5451c','b4f6f64c-21cd-429c-960a-3be92060dd81','4f0ce150-1a9c-4ea1-9315-b04fb28721b1','FTAU2515052','20GP','ON_WATER','CVAS','Kent'),
('27b78684-851e-4b11-baca-9b73bad7358a','079ff066-1945-48b8-9fd2-978046644ff2','175d49f8-7689-4fe7-bab3-520de9f4e9a4','CAIU6430470','20GP','ON_WATER','CVAS','Kent'),
('305f025a-46cc-4bad-81ba-df3c48053839','0211443b-cf7c-4434-b7a4-0182d695ad3b','79113814-b455-4fc1-a6aa-d177419cf105','SLEU2500547','20GP','ON_WATER','CVAS','Kent'),
('3237f674-e175-4950-b67a-d93a7f4a1837','0fb89251-5566-4d46-91fc-82a9c3419264','0f52128b-ac95-4b23-8922-a0cdf752d5d2','MSOU2676087','20GP','ON_WATER','CVAS','Kent'),
('32d58f48-fcf4-4f5a-b841-0b5e4ade6822','0211443b-cf7c-4434-b7a4-0182d695ad3b','f6940811-6213-4eec-9218-464de67b71dd','SLEU2500383','20GP','ON_WATER','CVAS','Kent'),
('35235e57-694a-4d25-8cfe-5833b3ccb899','fa07267a-d9fe-4189-bd4d-d8bf90f92753','ce228c97-ab52-43d3-a305-87cb6aa8a96a','EGSU1124810','40HQ','ON_WATER','CVAS','Kent'),
('35e25182-9d6f-402f-a14c-b0768e1b6322','496cf48f-ec35-4929-9ca6-129257810e77','1b0d17d2-1bfd-49fd-88fe-1dbd7086fdc1','FTAU2501059','20GP','ON_WATER','CVAS','Kent'),
('3c9c1912-94cc-413c-9c15-02f6d5d249c2','6de4bc2a-5a3c-46c0-ae9f-c700d57c4229','548ae16e-3955-473f-abe9-53ffbc568c4b','ONEU2247315','20GP','ON_WATER','CVAS','Kent'),
('41139652-445d-49ab-ab43-522e82eeb31c','0211443b-cf7c-4434-b7a4-0182d695ad3b','5029434b-be14-4947-811f-e0caeabbe675','BSLU4000058','40GP','ON_WATER','CVAS','Kent'),
('43a6a7dd-de53-43db-b7e3-d431c7a25989','5255c4f5-1d79-4fcc-96dd-76778cddc464','716b2ea8-4c47-4319-b769-73f225e9496a','XXXU2500774','20GP','ON_WATER','CVAS','Kent'),
('44c09034-220d-4370-af35-2375b8a7534c','6dc78103-76db-4dc8-bf78-fc56bae7f748','26eb9736-42a9-4935-a720-5fa13356f34a','EGSU2417751','40HQ','ON_WATER','CVAS','Kent'),
('46b7090e-509a-4eb0-8a60-f749250f79f9','c00fd89e-c00e-4103-a8f6-3526694eb446','b9ce370e-9e87-4c32-8614-e79ecabd8762','TGBU2224788','20GP','ON_WATER','CVAS','Kent'),
('47975097-54d4-4bb8-aa59-1dab1e07e388','fa07267a-d9fe-4189-bd4d-d8bf90f92753','6b03386c-5c4f-42d8-a40f-3d49c9ad5061','GCXU6428302','40HQ','ON_WATER','CVAS','Kent'),
('49bf4453-917f-4015-9a7b-d982a5b34624','ecc94738-8857-4f62-8420-29765163250b','e45b148e-5278-46ed-a258-b64b8ee7a838','HMMU2289633','20GP','ON_WATER','CVAS','Kent'),
('4eb45794-032b-408f-95c7-4e877aeae6b0','519f3a98-fe86-480c-893d-b64f183bf323','fafe9a2d-f1ab-4c12-bf2c-8ba2a210c5c8','TEMU1631500','20GP','ON_WATER','CVAS','Kent'),
('528123a4-2d83-4144-a7dd-1f5bd6126da7','58ad7073-cae1-4659-9517-54a2f2ccfd51','af6d2db8-d982-4da6-bfd9-74032db36878','KOCU2225851','20GP','ON_WATER','CVAS','Kent'),
('5d7847c8-bf8f-4f86-8465-ed77ae6465ab','01d826a7-6be5-4904-b0bd-e312107edcd5','2d5237c1-2e59-40d2-a5e5-2cc73cd6d9bc','DRYU2497537','20GP','ON_WATER','CVAS','Kent'),
('64c05ed4-9c96-41b9-8a04-3cbcc0d58ad1','0211443b-cf7c-4434-b7a4-0182d695ad3b','31e845d4-22f9-4041-bfaa-fd7a7976d282','BSLU4000079','40GP','ON_WATER','CVAS','Kent'),
('65f4da15-b9ce-4ae1-924a-3b80a1c436f6','6385225f-4b2c-43a8-975d-aa4a7e405038','58dfa71e-db3c-47c0-a84d-5cd60d901bb6','TGBU2501012','20GP','ON_WATER','CVAS','Kent'),
('664e731e-dc92-4807-bb8d-1707c369be46','5255c4f5-1d79-4fcc-96dd-76778cddc464','c09bfc6a-cdaf-4d69-9c6e-e274fb621182','TXGU5704736','40HQ','ON_WATER','CVAS','Kent'),
('69dd54ea-9ca7-4ad4-8b24-7e3e4c6f9d24','626ec7c1-1024-40d4-93c3-bc3f4fbf18ef','7696b5ae-9885-4dc0-a442-728fec0bcf38','HMMU2109270','20GP','ON_WATER','CVAS','Kent'),
('6b73bbcb-ae67-42c5-8f01-f953fe3acd75','fa07267a-d9fe-4189-bd4d-d8bf90f92753','f6b16775-455d-468b-beae-fe507dceda81','VPLU3220073','20GP','ON_WATER','CVAS','Kent'),
('784f154f-a035-448e-a95a-92c5aaffbfb4','477aa587-b5b8-4592-be70-96aa6d7b9e1c','3cb8835a-fcfe-482b-baeb-f5a2be55c0a5','TGBU2515633','20GP','ON_WATER','CVAS','Kent'),
('7cf17626-e2f7-49da-99fa-b307c7cdcb5b','dbfec9b7-3ed4-4bca-8ec1-f017be9168c3','9defac5e-d344-4e0b-8b4d-17dac772dd73','MSNU6916198','40HQ','ON_WATER','CVAS','Kent'),
('7d7cee71-0ab5-49c1-bb46-40b0f3b3251b','519f3a98-fe86-480c-893d-b64f183bf323','cae655bd-63df-482e-8b46-a4062004d652','MSOU7579069','20GP','ON_WATER','CVAS','Kent'),
('7de8c13d-4a84-4e2f-b0a7-2a56114160ce','2a623137-6722-4cf3-bbf6-56a57099fb58','dca61fa5-46f7-42de-8bcb-55859354b3f9','CAIU2943319','20GP','ON_WATER','CVAS','Kent'),
('82090e3f-9ed1-48cf-83b1-113f5223a4d5','fa07267a-d9fe-4189-bd4d-d8bf90f92753','952f2bf5-fd81-47f3-af2b-dcbdcabe9380','VPLU3220094','20GP','ON_WATER','CVAS','Kent'),
('889849c5-54de-44f3-9400-86c8db5c6705','808ff92b-d224-4b3d-8b97-236b0ca1b3df','9fa0d112-8f8d-407e-90c8-1eb5908124b8','KOCU2142464','20GP','ON_WATER','CVAS','Kent'),
('8a980571-3db6-4040-9848-efdf8ca9e729','0211443b-cf7c-4434-b7a4-0182d695ad3b','51d3ec61-0860-4e32-a5a9-0020d403a94a','BSLU4000042','40GP','ON_WATER','CVAS','Kent'),
('8c97e3b8-463f-4830-8a69-7d2533d1c616','8905adeb-4267-449c-8500-b1dbe0e3e759','7d927bfb-984b-466a-bdf1-384b55653d38','KOCU2078703','20GP','ON_WATER','CVAS','Kent'),
('8db90278-30ab-4b15-bdb7-9cfdad853f92','0211443b-cf7c-4434-b7a4-0182d695ad3b','9be7f477-df35-4802-afac-fc62556cbc19','DTXU2062473','20GP','ON_WATER','CVAS','Kent'),
('9087b106-78c8-4ee0-b598-b7b03a957b05','0fb89251-5566-4d46-91fc-82a9c3419264','3fb2b5f2-e955-4de0-962c-e19713e17b43','TCLU3819398','20GP','ON_WATER','CVAS','Kent'),
('94acb3a9-af87-4e7e-9dd0-eee42c300622','6385225f-4b2c-43a8-975d-aa4a7e405038','6f7e93bb-9cc3-4aa7-a7cd-36f2466e618f','HMMU2218183','20GP','ON_WATER','CVAS','Kent'),
('95f3f9d5-2394-41a3-9f4a-245b60ff6a59','fa07267a-d9fe-4189-bd4d-d8bf90f92753','0c489816-01c2-4a4d-a26e-24ea6162e56b','EGSU6346511','40HQ','ON_WATER','CVAS','Kent'),
('9e1b1e90-d430-40cb-a079-53f56f7f7f83','fa07267a-d9fe-4189-bd4d-d8bf90f92753','0e679026-867f-4ac6-8bb7-7c8fa922446f','EGSU1231905','40HQ','ON_WATER','CVAS','Kent'),
('a326cbd0-ce01-4688-8384-d4ae40a73b6e','fa07267a-d9fe-4189-bd4d-d8bf90f92753','cd31abe5-f755-4c7f-8539-e4dfe0cbb7e9','OCGU8028460','40HQ','ON_WATER','CVAS','Kent'),
('a5cb32e6-7f50-4614-881c-c75b11597cfe','2a623137-6722-4cf3-bbf6-56a57099fb58','2da3f690-49ff-45b1-91be-014a9b3e381e','MEDU500798','20GP','ON_WATER','CVAS','Kent'),
('b064b1cb-e401-4306-aba5-b3a671ec4b49','b4f6f64c-21cd-429c-960a-3be92060dd81','b1d7d933-21c8-430f-91c4-4de0b60eee24','FTAU2515047','20GP','ON_WATER','CVAS','Kent'),
('b73c091d-1eca-4c1e-9455-a25c5073300b','85947c9f-e720-443b-be96-812acb81569d','dd25ca09-da71-4e43-ac4e-b3ceca9d4ebb','MSOU7579074','20GP','ON_WATER','CVAS','Kent'),
('bc88c0b8-6900-4c65-840e-0ed13b614f2e','0211443b-cf7c-4434-b7a4-0182d695ad3b','6fc2736c-3931-43e3-9aed-794638f85ea0','OOLU4364369','40GP','ON_WATER','CVAS','Kent'),
('c2231e73-5ee4-4f3a-884a-21f99c51cf06','c00fd89e-c00e-4103-a8f6-3526694eb446','c6f69d14-80a5-4416-834f-fab0d026003e','GAOU2137708','20GP','ON_WATER','CVAS','Kent'),
('d8511449-9aa6-4495-9296-b54b7e94a62e','6dc78103-76db-4dc8-bf78-fc56bae7f748','15f8a0f5-eb33-4719-b306-46abd631d523','EMCU8816472','20GP','ON_WATER','CVAS','Kent'),
('d904e96c-878e-4fae-999f-fc8bdeeefcac','626ec7c1-1024-40d4-93c3-bc3f4fbf18ef','c227a834-88d1-4f1f-bac8-abb451a639f5','TLLU2592435','20GP','ON_WATER','CVAS','Kent'),
('dbdcc492-1a57-43d4-9dfb-216e882db2c8','496cf48f-ec35-4929-9ca6-129257810e77','2b13c850-3673-4116-90a5-613cc8e7d44a','FTAU2514668','20GP','ON_WATER','CVAS','Kent'),
('dd0dcf37-8738-4ffe-906c-9515212cb3dd','0211443b-cf7c-4434-b7a4-0182d695ad3b','52c1eb71-99c6-4d0b-827a-3ab44a88bca3','SLEU2500552','20GP','ON_WATER','CVAS','Kent'),
('e1956a73-dd8f-48d8-b71e-17293bad6bf1','b4f6f64c-21cd-429c-960a-3be92060dd81','95ad7d16-6530-4814-9b51-7c64545d929c','FTAU2522386','20GP','ON_WATER','CVAS','Kent'),
('e254a1ca-aeab-4602-8008-dbc4fe9247e5','079ff066-1945-48b8-9fd2-978046644ff2','76c5895a-8636-4a13-b2c4-1dc5c586714a','CAIU6465917','20GP','ON_WATER','CVAS','Kent'),
('e43749d4-55fb-4f2e-abbb-73185fd8a783','c6c3f21f-bf3c-4931-a141-177cbcaf73da','8ab7d3bc-50f9-4279-85d0-831db77c4eb6','KOCU2137914','20GP','ON_WATER','CVAS','Kent'),
('e54e9a4e-810c-4113-b394-aed81a80fee0','fa07267a-d9fe-4189-bd4d-d8bf90f92753','a9571a3d-a544-4fc2-937b-6543db791071','VPLU3220089','20GP','ON_WATER','CVAS','Kent'),
('f1f657d1-4a7c-4cf0-ac63-c0cda726dffd','fa07267a-d9fe-4189-bd4d-d8bf90f92753','a9fc3983-208a-481b-b164-607281a741ee','TXGU5648421','40HQ','ON_WATER','CVAS','Kent'),
('f51dcc57-ad4d-4fa9-99fd-1bc53ed7928f','fa07267a-d9fe-4189-bd4d-d8bf90f92753','d7606ab0-2bb6-42c1-9ad7-66b4cdcc6710','EGSU1516322','40HQ','ON_WATER','CVAS','Kent'),
('f87433da-e152-451c-91fa-8bd02500ba44','88626c66-b755-4549-ae03-ea6d26411cdb','84af21ad-7ae9-4122-ae4d-53b509aacb7c','MSBU2792785','20GP','ON_WATER','CVAS','Kent'),
('ff457e21-9593-49f6-95be-5f8aa5f8eb2b','0211443b-cf7c-4434-b7a4-0182d695ad3b','5dad3c12-6f81-4d7d-b4bc-662256556fc1','DTXU2062508','20GP','ON_WATER','CVAS','Kent')
ON CONFLICT (id) DO UPDATE SET
  container_number = EXCLUDED.container_number,
  container_type = EXCLUDED.container_type,
  status = EXCLUDED.status,
  carrier = EXCLUDED.carrier,
  warehouse = EXCLUDED.warehouse;

-- 3. Update shipment_containers with correct container_number from container_tracking
-- Match by shipment_id and position
UPDATE shipment_containers sc
SET container_number = ct.container_number,
    container_type = ct.container_type
FROM container_tracking ct
WHERE sc.shipment_id = ct.shipment_id
  AND sc.container_number LIKE 'CONTAINER%';

-- 4. Fix double-serialized status_history in shipment_tracking
UPDATE shipment_tracking 
SET status_history = (status_history #>> '{}')::jsonb
WHERE jsonb_typeof(status_history) = 'string';
