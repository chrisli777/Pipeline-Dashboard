-- ═══════════════════════════════════════════════════════════════════════════
-- 011: WHI Supply Chain Platform - Master Data + Shipment Tables
-- Phase 0A of the WHI端到端供应链智能平台 development plan
--
-- This migration adds:
--   Part 1: Master Data Tables (7 tables)
--     1. suppliers         - 供应商主数据
--     2. customers         - 客户主数据
--     3. customer_quotations - 客户报价(按供应商/季度/SKU)
--     4. forwarder_quotes  - 货代报价(按供应商/月/柜型)
--     5. exchange_rates    - 月度汇率
--     6. tariff_rates      - 关税率(理论)
--     7. actual_duties     - 实缴关税记录
--   Part 2: Shipment & Tracking Tables (4 tables)
--     8. shipments          - 发货主表
--     9. shipment_containers - 集装箱/SKU明细
--    10. shipment_tracking   - 出货追踪(8阶段状态)
--    11. rollover_log        - Rollover日志
--   Part 3: Extend existing skus table
--   Part 4: Update inventory_view with in-transit data
--
-- Prerequisites: 001 through 010 must have been run
--   (001-008: inventory base tables, 009: AMC SKUs, 010: supplier_code in view)
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════
-- PART 1: MASTER DATA TABLES (7 tables)
-- Source: config.json → structured Supabase tables
-- ═══════════════════════════════════════════

-- ─────────────────────────────
-- 1. SUPPLIERS (供应商主数据)
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,               -- AMC, HX, TJJSH, HX-CLARK
  name TEXT,                                -- 全称: 常州法联精机, 山西华翔, 天津津尚华
  name_cn TEXT,                             -- 中文名: 法联精机, 华翔, 津尚华
  customer_code TEXT,                       -- 对应客户: WHI, CLARK, GENIE
  business_type TEXT NOT NULL DEFAULT 'TRADE'
    CHECK (business_type IN ('TRADE', '3PL', 'DIRECT')),
    -- TRADE: WHI代采再销 (AMC→WHI, HX→WHI, TJJSH→WHI→Genie)
    -- DIRECT: 直发+管理费 (HX→Clark, WHI收管理费)
    -- 3PL: 未来3PL/VMI服务
  route TEXT,                               -- 路线描述: 上海→西雅图
  origin_port TEXT,                         -- 起运港: Shanghai / Qingdao
  dest_port TEXT DEFAULT 'Seattle',         -- 目的港
  forwarder TEXT,                           -- 默认货代: Air Tiger
  production_lead_time_weeks INTEGER,       -- 生产周期(周)
  transit_time_weeks INTEGER DEFAULT 4,     -- 海运时间(周)
  moq JSONB DEFAULT '{}',                  -- {sku_code: min_qty}
  contact_name TEXT,
  contact_email TEXT,
  notes TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'whi',   -- 多租户预留
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data: WHI's 4 supplier routes
INSERT INTO suppliers (code, name, name_cn, customer_code, business_type, route, origin_port, forwarder, production_lead_time_weeks, transit_time_weeks) VALUES
  ('AMC', 'Changzhou Falian Jingji', '常州法联精机', 'WHI', 'TRADE', 'Shanghai → Seattle', 'Shanghai', 'Air Tiger', 3, 4),
  ('HX', 'Shanxi Huaxiang', '山西华翔', 'WHI', 'TRADE', 'Qingdao → Seattle', 'Qingdao', NULL, 3, 4),
  ('TJJSH', 'Tianjin Jinshanghua', '天津津尚华', 'GENIE', 'TRADE', 'Tianjin → Seattle', 'Tianjin', NULL, 3, 4),
  ('HX-CLARK', 'Shanxi Huaxiang (Clark Direct)', '华翔(Clark直发)', 'CLARK', 'DIRECT', 'Qingdao → Seattle', 'Qingdao', NULL, 3, 4)
ON CONFLICT (code) DO NOTHING;


-- ─────────────────────────────
-- 2. CUSTOMERS (客户主数据)
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,               -- WHI, GENIE, CLARK
  name TEXT,                                -- WHI International, Genie/Terex, Clark Material Handling
  contact_name TEXT,
  contact_email TEXT,
  billing_type TEXT DEFAULT 'TRADE'
    CHECK (billing_type IN ('TRADE', '3PL_VMI', 'DIRECT')),
    -- TRADE: 贸易客户(WHI自销)
    -- 3PL_VMI: 服务客户(未来)
    -- DIRECT: 直发客户(Clark)
  notes TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'whi',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO customers (code, name, billing_type) VALUES
  ('WHI', 'WHI International LLC', 'TRADE'),
  ('GENIE', 'Genie / Terex', 'TRADE'),
  ('CLARK', 'Clark Material Handling', 'DIRECT')
ON CONFLICT (code) DO NOTHING;


-- ─────────────────────────────
-- 3. CUSTOMER QUOTATIONS (客户报价)
-- 按供应商 × 季度 × SKU 的完整报价链
-- Source: config.json → customer_quotations
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS customer_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code TEXT NOT NULL,             -- AMC, HX
  quarter TEXT NOT NULL,                    -- 2025Q4, 2026Q1
  sku_code TEXT NOT NULL,                   -- PN number: 229579, 132517 等
  sku_description TEXT,                     -- 中文描述
  exw NUMERIC DEFAULT 0,                   -- EXW出厂价(USD)
  local_fee NUMERIC DEFAULT 0,             -- 本地费用
  ocean NUMERIC DEFAULT 0,                 -- 海运费
  clearance NUMERIC DEFAULT 0,             -- 清关费
  delivery NUMERIC DEFAULT 0,              -- 配送费
  tariff NUMERIC DEFAULT 0,                -- 关税
  vmi NUMERIC DEFAULT 0,                   -- VMI费用
  total NUMERIC DEFAULT 0,                 -- 总到仓成本
  qty_per_container INTEGER,                -- 每柜装量
  valid_from DATE,
  valid_to DATE,
  tenant_id TEXT NOT NULL DEFAULT 'whi',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_code, quarter, sku_code)
);

CREATE INDEX IF NOT EXISTS idx_cq_supplier_quarter
  ON customer_quotations(supplier_code, quarter);


-- ─────────────────────────────
-- 4. FORWARDER QUOTES (货代报价)
-- 按供应商 × 月份 × 柜型 的费用明细
-- Source: config.json → freight_forwarder_quotes
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS forwarder_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code TEXT NOT NULL,             -- AMC, HX
  month TEXT NOT NULL,                      -- 2025-11, 2026-01
  container_type TEXT NOT NULL,             -- 20GP, 40HQ, 40G
  export_truck_cny NUMERIC DEFAULT 0,      -- 出口拖车费(CNY)
  customs_declare_cny NUMERIC DEFAULT 0,   -- 报关费(CNY)
  ocean_freight_usd NUMERIC DEFAULT 0,     -- 海运费(USD)
  local_cny NUMERIC DEFAULT 0,             -- LOCAL费(CNY)
  clearance_usd NUMERIC DEFAULT 0,         -- 清关费(USD)
  delivery_usd NUMERIC DEFAULT 0,          -- 整柜直送费(USD)
  total_usd NUMERIC DEFAULT 0,             -- 总费用(USD), 可计算
  notes TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'whi',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_code, month, container_type)
);

CREATE INDEX IF NOT EXISTS idx_fq_supplier_month
  ON forwarder_quotes(supplier_code, month);


-- ─────────────────────────────
-- 5. EXCHANGE RATES (汇率)
-- 月度 USD/CNY 汇率
-- Source: config.json → exchange_rates
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL UNIQUE,              -- 2025-11, 2026-01
  usd_cny NUMERIC NOT NULL,               -- 美元/人民币汇率
  source TEXT DEFAULT 'manual',            -- manual / api
  tenant_id TEXT NOT NULL DEFAULT 'whi',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────
-- 6. TARIFF RATES (关税率 - 理论)
-- 按供应商 × 季度 × SKU 的理论关税
-- Source: config.json → sku_tariff
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS tariff_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code TEXT NOT NULL,
  quarter TEXT NOT NULL,                    -- 2025Q4, 2026Q1
  sku_code TEXT NOT NULL,
  theoretical_duty NUMERIC,                -- 理论单件关税(USD)
  hts_code TEXT,                            -- HTS关税编码(未来)
  duty_rate_pct NUMERIC,                   -- 关税税率%(未来)
  tenant_id TEXT NOT NULL DEFAULT 'whi',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_code, quarter, sku_code)
);


-- ─────────────────────────────
-- 7. ACTUAL DUTIES (实缴关税记录)
-- Source: config.json → actual_duty
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS actual_duties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL,            -- 发票号
  entry_number TEXT,                        -- 报关Entry号
  broker_invoice TEXT,                      -- 报关行发票号
  duty_amount NUMERIC,                     -- 实缴关税金额(USD)
  mpf NUMERIC DEFAULT 0,                   -- Merchandise Processing Fee
  hmf NUMERIC DEFAULT 0,                   -- Harbor Maintenance Fee
  supplier_code TEXT,
  quarter TEXT,
  cleared_date DATE,
  shipment_id UUID,                         -- FK to shipments (Phase 2 link)
  notes TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'whi',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_invoice
  ON actual_duties(invoice_number);
CREATE INDEX IF NOT EXISTS idx_ad_supplier_quarter
  ON actual_duties(supplier_code, quarter);


-- ═══════════════════════════════════════════
-- PART 2: SHIPMENT & TRACKING TABLES (4 tables)
-- Source: shipments_data.json → Supabase
-- ═══════════════════════════════════════════

-- ─────────────────────────────
-- 8. SHIPMENTS (发货主表)
-- Each record = one invoice/shipment
-- Source: shipments_data.json → shipments[]
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier TEXT NOT NULL,                   -- AMC, HX, TJJSH, CLARK
  invoice_number TEXT NOT NULL UNIQUE,      -- 25111501, HX-20251205 etc.
  bol_number TEXT,                          -- B/L号: EGLV142503419969
  folder_name TEXT,                         -- 原始文件夹名
  etd DATE,                                 -- Estimated Time of Departure
  eta DATE,                                 -- Estimated Time of Arrival
  actual_departure DATE,                    -- 实际离港日期
  actual_arrival DATE,                      -- 实际到港日期
  container_count INTEGER DEFAULT 0,
  sku_count INTEGER DEFAULT 0,
  total_value NUMERIC DEFAULT 0,
  total_weight NUMERIC DEFAULT 0,
  total_volume NUMERIC DEFAULT 0,           -- CBM(未来)
  po_numbers TEXT[],                        -- PO号数组: ['699', '700']
  currency TEXT DEFAULT 'USD',
  incoterm TEXT DEFAULT 'EXW',
  notes TEXT,
  processed_at TIMESTAMPTZ,                 -- Python处理时间
  tenant_id TEXT NOT NULL DEFAULT 'whi',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_supplier
  ON shipments(supplier);
CREATE INDEX IF NOT EXISTS idx_shipments_etd
  ON shipments(etd);
CREATE INDEX IF NOT EXISTS idx_shipments_eta
  ON shipments(eta);
CREATE INDEX IF NOT EXISTS idx_shipments_invoice
  ON shipments(invoice_number);


-- ─────────────────────────────
-- 9. SHIPMENT CONTAINERS (集装箱/SKU明细)
-- Each record = one container × one SKU × one PO
-- Source: shipments_data.json → matches[]
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  container_number TEXT,                    -- EMCU8816472
  container_type TEXT,                      -- 20GP, 40HQ, 20G
  seal_number TEXT,                         -- 铅封号(未来)
  sku TEXT NOT NULL,                        -- PN: 229579
  sku_description TEXT,                     -- SKU中文描述(冗余，方便查询)
  po_number TEXT,                           -- PO号
  quantity INTEGER DEFAULT 0,
  unit_price NUMERIC,
  total_amount NUMERIC,
  gross_weight NUMERIC,                     -- 毛重(lbs)
  net_weight NUMERIC,                       -- 净重(lbs, 未来)
  tenant_id TEXT NOT NULL DEFAULT 'whi',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sc_shipment
  ON shipment_containers(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sc_sku
  ON shipment_containers(sku);
CREATE INDEX IF NOT EXISTS idx_sc_container
  ON shipment_containers(container_number);
CREATE INDEX IF NOT EXISTS idx_sc_po
  ON shipment_containers(po_number);


-- ─────────────────────────────
-- 10. SHIPMENT TRACKING (出货追踪 - 8阶段状态)
-- One tracking record per shipment (1:1)
-- Status flow: SHIPPED → IN_TRANSIT → ARRIVED → CLEARED → PICKED_UP → SCHEDULED → DELIVERED → CLOSED
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,

  -- Current status
  status TEXT NOT NULL DEFAULT 'SHIPPED'
    CHECK (status IN (
      'SHIPPED',     -- 已出货(ETD已确认)
      'IN_TRANSIT',  -- 在途(已离港)
      'ARRIVED',     -- 已到港
      'CLEARED',     -- 已清关
      'PICKED_UP',   -- 已提柜
      'SCHEDULED',   -- 已预约送仓
      'DELIVERED',   -- 已送达仓库
      'CLOSED'       -- 已结案(所有费用结清)
    )),

  -- Key dates (each status transition fills in the relevant date)
  shipped_date DATE,                        -- 出货日期 (≈ ETD)
  departed_date DATE,                       -- 实际离港
  arrived_port_date DATE,                   -- 到港日期
  cleared_date DATE,                        -- 清关完成日期
  picked_up_date DATE,                      -- 提柜日期
  scheduled_date DATE,                      -- 预约送仓日期
  delivered_date DATE,                      -- 实际送达日期
  closed_date DATE,                         -- 结案日期

  -- Clearance details
  duty_amount NUMERIC,                      -- 关税金额
  entry_number TEXT,                        -- 清关Entry号
  broker TEXT,                              -- 报关行

  -- LFD (Last Free Day) management
  lfd DATE,                                 -- 码头免费堆存截止日
  lfd_extended DATE,                        -- 延期后的LFD
  demurrage_amount NUMERIC DEFAULT 0,       -- 滞期费
  detention_amount NUMERIC DEFAULT 0,       -- 滞箱费

  -- Delivery details
  carrier TEXT,                             -- 拖车公司
  warehouse TEXT,                           -- 目的仓库: Extensiv
  delivery_reference TEXT,                  -- 送仓预约号

  -- WMS receipt
  wms_receipt_number TEXT,                  -- WMS入库单号
  wms_received_qty INTEGER,                 -- WMS实收数量

  -- History & notes
  status_history JSONB DEFAULT '[]',        -- [{status, date, user, notes}]
  notes TEXT,

  tenant_id TEXT NOT NULL DEFAULT 'whi',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One tracking record per shipment
  CONSTRAINT shipment_tracking_unique_shipment UNIQUE (shipment_id)
);

CREATE INDEX IF NOT EXISTS idx_st_status
  ON shipment_tracking(status);
CREATE INDEX IF NOT EXISTS idx_st_lfd
  ON shipment_tracking(lfd);
CREATE INDEX IF NOT EXISTS idx_st_shipment
  ON shipment_tracking(shipment_id);


-- ─────────────────────────────
-- 11. ROLLOVER LOG (Rollover日志)
-- When expected ATA > actual ATA, difference rolls to next week
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS rollover_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,                        -- PN: 229579
  sku_id UUID REFERENCES skus(id),          -- FK to skus table
  from_week INTEGER NOT NULL,               -- 原计划周次
  to_week INTEGER NOT NULL,                 -- 滚动到的周次
  expected_qty NUMERIC NOT NULL DEFAULT 0,  -- 预期到货量
  actual_qty NUMERIC NOT NULL DEFAULT 0,    -- 实际到货量
  rollover_qty NUMERIC NOT NULL DEFAULT 0,  -- 滚动量 = expected - actual
  shipment_id UUID REFERENCES shipments(id),
  container_number TEXT,
  reason TEXT,                              -- 滚动原因
  tenant_id TEXT NOT NULL DEFAULT 'whi',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rl_sku_week
  ON rollover_log(sku, from_week);


-- ═══════════════════════════════════════════
-- PART 3: EXTEND EXISTING TABLES
-- Add columns to skus table for supplier/code mapping
-- ═══════════════════════════════════════════

-- Add supplier and sku_code columns to existing skus table
ALTER TABLE skus ADD COLUMN IF NOT EXISTS supplier_code TEXT;       -- AMC, HX, TJJSH
ALTER TABLE skus ADD COLUMN IF NOT EXISTS sku_code TEXT;            -- PN number only: 229579
ALTER TABLE skus ADD COLUMN IF NOT EXISTS qty_per_container INTEGER;-- 每柜装量
ALTER TABLE skus ADD COLUMN IF NOT EXISTS unit_weight NUMERIC;      -- 单件重量(lbs)
ALTER TABLE skus ADD COLUMN IF NOT EXISTS lead_time_weeks INTEGER;  -- SKU级别的lead time覆盖
ALTER TABLE skus ADD COLUMN IF NOT EXISTS safety_stock_weeks NUMERIC DEFAULT 4; -- 安全库存(周)
ALTER TABLE skus ADD COLUMN IF NOT EXISTS reorder_point NUMERIC;    -- 补货点(件数)
ALTER TABLE skus ADD COLUMN IF NOT EXISTS moq INTEGER;              -- 最小起订量
ALTER TABLE skus ADD COLUMN IF NOT EXISTS abc_class TEXT;           -- A/B/C 价值分类
ALTER TABLE skus ADD COLUMN IF NOT EXISTS xyz_class TEXT;           -- X/Y/Z 稳定性分类
ALTER TABLE skus ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'whi';

-- Update existing SKUs with sku_code
UPDATE skus SET sku_code = '1272762', supplier_code = 'AMC' WHERE part_model LIKE '%1272762%' AND sku_code IS NULL;
UPDATE skus SET sku_code = '1272913', supplier_code = 'AMC' WHERE part_model LIKE '%1272913%' AND sku_code IS NULL;
UPDATE skus SET sku_code = '61415', supplier_code = 'HX' WHERE part_model LIKE '%61415%' AND sku_code IS NULL;
UPDATE skus SET sku_code = '824433', supplier_code = 'HX' WHERE part_model LIKE '%824433%' AND sku_code IS NULL;

-- Create unique index on sku_code (when not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_skus_sku_code ON skus(sku_code) WHERE sku_code IS NOT NULL;


-- Add etd_source column to inventory_data to distinguish manual vs shipment-derived ETD
ALTER TABLE inventory_data ADD COLUMN IF NOT EXISTS etd_source TEXT DEFAULT 'manual'
  CHECK (etd_source IN ('manual', 'shipment', 'forecast'));
ALTER TABLE inventory_data ADD COLUMN IF NOT EXISTS in_transit NUMERIC DEFAULT 0;


-- ═══════════════════════════════════════════
-- PART 4: HELPER FUNCTIONS & VIEWS
-- ═══════════════════════════════════════════

-- Function: Get week number for a given date
-- Uses same Week 1 = Dec 29, 2025 (Monday) convention as the existing system
CREATE OR REPLACE FUNCTION get_week_number(p_date DATE)
RETURNS INTEGER AS $$
DECLARE
  week1_monday DATE := '2025-12-29';
  diff_days INTEGER;
BEGIN
  diff_days := p_date - week1_monday;
  IF diff_days < 0 THEN RETURN 0; END IF;
  RETURN (diff_days / 7) + 1;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Function: Get week start date for a given week number
CREATE OR REPLACE FUNCTION get_week_start_date(p_week_number INTEGER)
RETURNS DATE AS $$
BEGIN
  RETURN '2025-12-29'::DATE + ((p_week_number - 1) * 7);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- View: Shipment overview with tracking status
CREATE OR REPLACE VIEW shipment_overview AS
SELECT
  s.id,
  s.supplier,
  s.invoice_number,
  s.bol_number,
  s.etd,
  s.eta,
  s.container_count,
  s.sku_count,
  s.total_value,
  s.total_weight,
  s.po_numbers,
  t.status,
  t.lfd,
  t.lfd_extended,
  t.cleared_date,
  t.delivered_date,
  t.carrier,
  t.warehouse,
  t.duty_amount,
  -- Days since ETA (for urgency calculations)
  CASE
    WHEN t.status NOT IN ('DELIVERED', 'CLOSED') AND s.eta IS NOT NULL
    THEN CURRENT_DATE - s.eta
    ELSE NULL
  END as days_since_eta,
  -- LFD urgency: days until LFD
  CASE
    WHEN t.lfd IS NOT NULL AND t.status IN ('ARRIVED', 'CLEARED')
    THEN t.lfd - CURRENT_DATE
    ELSE NULL
  END as days_to_lfd,
  -- LFD status
  CASE
    WHEN t.lfd IS NULL THEN 'N/A'
    WHEN t.status IN ('DELIVERED', 'CLOSED') THEN 'RESOLVED'
    WHEN t.lfd <= CURRENT_DATE THEN 'OVERDUE'
    WHEN t.lfd <= CURRENT_DATE + INTERVAL '3 days' THEN 'CRITICAL'
    WHEN t.lfd <= CURRENT_DATE + INTERVAL '7 days' THEN 'WARNING'
    ELSE 'OK'
  END as lfd_status,
  s.created_at,
  s.updated_at
FROM shipments s
LEFT JOIN shipment_tracking t ON s.id = t.shipment_id
ORDER BY
  CASE t.status
    WHEN 'SHIPPED' THEN 1
    WHEN 'IN_TRANSIT' THEN 2
    WHEN 'ARRIVED' THEN 3
    WHEN 'CLEARED' THEN 4
    WHEN 'PICKED_UP' THEN 5
    WHEN 'SCHEDULED' THEN 6
    WHEN 'DELIVERED' THEN 7
    WHEN 'CLOSED' THEN 8
    ELSE 9
  END,
  s.eta ASC NULLS LAST;


-- View: In-transit SKU summary for Pipeline Dashboard integration
-- Shows quantity of each SKU currently in transit, grouped by expected arrival week
CREATE OR REPLACE VIEW in_transit_by_sku_week AS
SELECT
  sc.sku,
  get_week_number(s.eta) as expected_week,
  s.eta as expected_arrival,
  SUM(sc.quantity) as in_transit_qty,
  COUNT(DISTINCT sc.container_number) as container_count,
  ARRAY_AGG(DISTINCT s.invoice_number) as invoice_numbers,
  MAX(t.status) as latest_status
FROM shipment_containers sc
JOIN shipments s ON sc.shipment_id = s.id
LEFT JOIN shipment_tracking t ON s.id = t.shipment_id
WHERE t.status IS NULL
   OR t.status NOT IN ('DELIVERED', 'CLOSED')
GROUP BY sc.sku, s.eta
ORDER BY sc.sku, s.eta;


-- View: Dashboard summary stats for Control Tower
CREATE OR REPLACE VIEW shipment_dashboard_stats AS
SELECT
  -- Total counts by status
  COUNT(*) FILTER (WHERE t.status = 'IN_TRANSIT') as in_transit_count,
  COUNT(*) FILTER (WHERE t.status = 'ARRIVED') as arrived_count,
  COUNT(*) FILTER (WHERE t.status = 'CLEARED') as cleared_count,
  COUNT(*) FILTER (WHERE t.status IN ('PICKED_UP', 'SCHEDULED')) as pending_delivery_count,
  COUNT(*) FILTER (WHERE t.status = 'DELIVERED') as delivered_count,
  COUNT(*) FILTER (WHERE t.status NOT IN ('DELIVERED', 'CLOSED')) as active_shipments,
  -- LFD alerts
  COUNT(*) FILTER (
    WHERE t.lfd IS NOT NULL
    AND t.lfd <= CURRENT_DATE + INTERVAL '3 days'
    AND t.status NOT IN ('DELIVERED', 'CLOSED')
  ) as lfd_critical_count,
  -- ETA this week
  COUNT(*) FILTER (
    WHERE s.eta BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    AND t.status NOT IN ('DELIVERED', 'CLOSED')
  ) as arriving_this_week,
  -- Total value in transit
  COALESCE(SUM(s.total_value) FILTER (
    WHERE t.status NOT IN ('DELIVERED', 'CLOSED')
  ), 0) as total_value_in_transit,
  -- By supplier
  COUNT(*) FILTER (WHERE s.supplier = 'AMC' AND t.status NOT IN ('DELIVERED', 'CLOSED')) as amc_active,
  COUNT(*) FILTER (WHERE s.supplier = 'HX' AND t.status NOT IN ('DELIVERED', 'CLOSED')) as hx_active,
  COUNT(*) FILTER (WHERE s.supplier = 'TJJSH' AND t.status NOT IN ('DELIVERED', 'CLOSED')) as tjjsh_active,
  COUNT(*) FILTER (WHERE s.supplier LIKE '%CLARK%' AND t.status NOT IN ('DELIVERED', 'CLOSED')) as clark_active
FROM shipments s
LEFT JOIN shipment_tracking t ON s.id = t.shipment_id;


-- ═══════════════════════════════════════════
-- PART 5: ROW-LEVEL SECURITY (RLS) POLICIES
-- Pre-configured for multi-tenant (currently 'whi' only)
-- ═══════════════════════════════════════════

-- Enable RLS on all new tables (but allow all access for now via permissive policies)
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE forwarder_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariff_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE actual_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE rollover_log ENABLE ROW LEVEL SECURITY;

-- Permissive policies: allow all operations for authenticated users
-- These will be tightened when multi-tenant is implemented
CREATE POLICY "Allow all for authenticated users" ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON customer_quotations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON forwarder_quotes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON exchange_rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON tariff_rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON actual_duties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON shipments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON shipment_containers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON shipment_tracking FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON rollover_log FOR ALL USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════
-- PART 6: TRIGGER FOR TRACKING STATUS HISTORY
-- Automatically log status changes
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_tracking_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_history := COALESCE(OLD.status_history, '[]'::JSONB) || jsonb_build_object(
      'from_status', OLD.status,
      'to_status', NEW.status,
      'changed_at', NOW()::TEXT,
      'notes', COALESCE(NEW.notes, '')
    );
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tracking_status_history ON shipment_tracking;
CREATE TRIGGER trg_tracking_status_history
  BEFORE UPDATE OF status ON shipment_tracking
  FOR EACH ROW
  EXECUTE FUNCTION log_tracking_status_change();


-- ═══════════════════════════════════════════
-- DONE
-- Run this SQL in Supabase SQL Editor to create all tables
-- Next: Phase 0B → supabase_sync.py to populate data
-- ═══════════════════════════════════════════
