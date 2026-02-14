-- ═══════════════════════════════════════════════════════════════════════════
-- 012: Phase 2 — 5-Stage Status Migration, Container Tracking & RPC Functions
--
-- This migration captures all database changes made during Phase 2A/2B/2C:
--   Part 1: Migrate shipment_tracking from 8-stage to 5-stage status model
--   Part 2: Create container_tracking table (per-container dispatch tracking)
--   Part 3: Update existing views to 5-stage model
--   Part 4: Create new views (v_container_dispatch, inventory_dashboard)
--   Part 5: Create RPC functions (sync, deliver, rollover)
--   Part 6: Add missing columns to inventory_data
--   Part 7: Grant permissions
--
-- Prerequisites: 001 through 011 must have been run
--   (001-008: inventory base, 009: AMC SKUs, 010: supplier_code in view,
--    011: master data + shipment tables)
-- 5-Stage Model: ON_WATER → CLEARED → DELIVERING → DELIVERED → CLOSED
--   - Shipment level: ON_WATER → CLEARED (port clearance)
--   - Container level: CLEARED → DELIVERING → DELIVERED (per-container dispatch)
--   - Shipment level: DELIVERED → CLOSED (all costs settled)
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════
-- PART 1: MIGRATE shipment_tracking TO 5-STAGE MODEL
-- Old: SHIPPED → IN_TRANSIT → ARRIVED → CLEARED → PICKED_UP → SCHEDULED → DELIVERED → CLOSED
-- New: ON_WATER → CLEARED → DELIVERING → DELIVERED → CLOSED
-- ═══════════════════════════════════════════

-- Step 1a: Migrate existing data to new status names
UPDATE shipment_tracking SET status = 'ON_WATER'
  WHERE status IN ('SHIPPED', 'IN_TRANSIT', 'ARRIVED');

UPDATE shipment_tracking SET status = 'DELIVERING'
  WHERE status IN ('PICKED_UP', 'SCHEDULED');

-- Step 1b: Drop old CHECK constraint, add new one
ALTER TABLE shipment_tracking DROP CONSTRAINT IF EXISTS shipment_tracking_status_check;
ALTER TABLE shipment_tracking ADD CONSTRAINT shipment_tracking_status_check
  CHECK (status IN ('ON_WATER', 'CLEARED', 'DELIVERING', 'DELIVERED', 'CLOSED'));

-- Step 1c: Update default (new shipments start as ON_WATER)
ALTER TABLE shipment_tracking ALTER COLUMN status SET DEFAULT 'ON_WATER';

-- Step 1d: Add estimated_warehouse_date column
ALTER TABLE shipment_tracking ADD COLUMN IF NOT EXISTS estimated_warehouse_date DATE;


-- ═══════════════════════════════════════════
-- PART 2: container_tracking TABLE (NEW)
-- Per-container dispatch tracking for CLEARED → DELIVERING → DELIVERED
-- Each container gets its own status, carrier, warehouse assignment
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS container_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  container_number TEXT NOT NULL,
  container_type TEXT,
  status TEXT NOT NULL DEFAULT 'ON_WATER'
    CHECK (status IN ('ON_WATER', 'CLEARED', 'DELIVERING', 'DELIVERED', 'CLOSED')),
  estimated_warehouse_date DATE,
  picked_up_date DATE,
  scheduled_delivery_date DATE,
  delivered_date DATE,
  carrier TEXT,                             -- 拖车公司
  warehouse TEXT,                           -- 目的仓库: Kent / Moses Lake
  delivery_reference TEXT,                  -- 送仓预约号
  wms_receipt_number TEXT,                  -- WMS入库单号
  wms_received_qty INTEGER,                 -- WMS实收数量
  notes TEXT,
  status_history JSONB DEFAULT '[]',        -- [{from_status, to_status, changed_at, notes}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One tracking record per container per shipment
  UNIQUE(shipment_id, container_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ct_status
  ON container_tracking(status);
CREATE INDEX IF NOT EXISTS idx_ct_shipment
  ON container_tracking(shipment_id);
CREATE INDEX IF NOT EXISTS idx_ct_delivery
  ON container_tracking(scheduled_delivery_date)
  WHERE scheduled_delivery_date IS NOT NULL;

-- RLS
ALTER TABLE container_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "container_tracking_select" ON container_tracking
  FOR SELECT USING (true);
CREATE POLICY "container_tracking_insert" ON container_tracking
  FOR INSERT WITH CHECK (true);
CREATE POLICY "container_tracking_update" ON container_tracking
  FOR UPDATE USING (true);


-- ═══════════════════════════════════════════
-- PART 2B: CONTAINER STATUS CHANGE TRIGGERS
-- ═══════════════════════════════════════════

-- Trigger function: log container status changes to status_history JSONB
CREATE OR REPLACE FUNCTION log_container_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_history := COALESCE(OLD.status_history, '[]'::JSONB) || jsonb_build_object(
      'from_status', OLD.status,
      'to_status', NEW.status,
      'changed_at', NOW()::TEXT,
      'changed_by', COALESCE(current_setting('app.current_user', true), 'system'),
      'notes', COALESCE(NEW.notes, '')
    );
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_container_status_history ON container_tracking;
CREATE TRIGGER trg_container_status_history
  BEFORE UPDATE OF status ON container_tracking
  FOR EACH ROW
  EXECUTE FUNCTION log_container_status_change();


-- Trigger function: auto-sync shipment status when all containers reach a threshold
-- When ALL containers are DELIVERED → shipment becomes DELIVERED
-- When ALL containers are CLOSED → shipment becomes CLOSED
-- When ANY container is DELIVERING → shipment becomes DELIVERING
CREATE OR REPLACE FUNCTION sync_shipment_status_from_containers()
RETURNS TRIGGER AS $$
DECLARE
  all_delivered BOOLEAN;
  all_closed BOOLEAN;
  any_delivering BOOLEAN;
BEGIN
  SELECT
    BOOL_AND(ct.status IN ('DELIVERED', 'CLOSED')),
    BOOL_AND(ct.status = 'CLOSED'),
    BOOL_OR(ct.status = 'DELIVERING')
  INTO all_delivered, all_closed, any_delivering
  FROM container_tracking ct
  WHERE ct.shipment_id = NEW.shipment_id;

  IF all_closed THEN
    UPDATE shipment_tracking SET status = 'CLOSED', updated_at = NOW()
    WHERE shipment_id = NEW.shipment_id AND status <> 'CLOSED';
  ELSIF all_delivered THEN
    UPDATE shipment_tracking SET status = 'DELIVERED', updated_at = NOW()
    WHERE shipment_id = NEW.shipment_id AND status NOT IN ('DELIVERED', 'CLOSED');
  ELSIF any_delivering THEN
    UPDATE shipment_tracking SET status = 'DELIVERING', updated_at = NOW()
    WHERE shipment_id = NEW.shipment_id AND status NOT IN ('DELIVERING', 'DELIVERED', 'CLOSED');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_shipment_status ON container_tracking;
CREATE TRIGGER trg_sync_shipment_status
  AFTER UPDATE OF status ON container_tracking
  FOR EACH ROW
  EXECUTE FUNCTION sync_shipment_status_from_containers();


-- ═══════════════════════════════════════════
-- PART 3: UPDATE EXISTING VIEWS TO 5-STAGE MODEL
-- ═══════════════════════════════════════════

-- 3a: shipment_overview — update ORDER BY and LFD logic to 5-stage
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
  -- Days since ETA
  CASE
    WHEN t.status NOT IN ('DELIVERED', 'CLOSED') AND s.eta IS NOT NULL
    THEN CURRENT_DATE - s.eta
    ELSE NULL
  END as days_since_eta,
  -- Days to LFD (applicable when CLEARED, before containers are picked up)
  CASE
    WHEN t.lfd IS NOT NULL AND t.status IN ('CLEARED', 'DELIVERING')
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
    WHEN 'ON_WATER' THEN 1
    WHEN 'CLEARED' THEN 2
    WHEN 'DELIVERING' THEN 3
    WHEN 'DELIVERED' THEN 4
    WHEN 'CLOSED' THEN 5
    ELSE 9
  END,
  s.eta ASC NULLS LAST;


-- 3b: shipment_dashboard_stats — update to 5-stage model with container stats
CREATE OR REPLACE VIEW shipment_dashboard_stats AS
SELECT
  -- Shipment-level counts (5-stage)
  COUNT(*) FILTER (WHERE t.status = 'ON_WATER') as on_water_count,
  COUNT(*) FILTER (WHERE t.status = 'CLEARED') as cleared_count,
  COUNT(*) FILTER (WHERE t.status = 'DELIVERING') as delivering_count,
  COUNT(*) FILTER (WHERE t.status = 'DELIVERED') as delivered_count,
  COUNT(*) FILTER (WHERE t.status NOT IN ('DELIVERED', 'CLOSED')) as active_shipments,

  -- LFD alerts (critical = within 3 days)
  COUNT(*) FILTER (
    WHERE t.lfd IS NOT NULL
    AND t.lfd <= CURRENT_DATE + INTERVAL '3 days'
    AND t.status NOT IN ('DELIVERED', 'CLOSED')
  ) as lfd_critical_count,

  -- ETA arriving this week
  COUNT(*) FILTER (
    WHERE s.eta BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    AND t.status NOT IN ('DELIVERED', 'CLOSED')
  ) as arriving_this_week,

  -- Total value in transit
  COALESCE(SUM(s.total_value) FILTER (
    WHERE t.status NOT IN ('DELIVERED', 'CLOSED')
  ), 0) as total_value_in_transit,

  -- Container-level stats (from container_tracking)
  (SELECT COUNT(*) FROM container_tracking WHERE status NOT IN ('DELIVERED', 'CLOSED')) as total_containers,
  (SELECT COUNT(*) FROM container_tracking WHERE status = 'CLEARED') as containers_cleared,
  (SELECT COUNT(*) FROM container_tracking WHERE status = 'DELIVERING') as containers_delivering,
  (SELECT COUNT(*) FROM container_tracking WHERE status = 'DELIVERED') as containers_delivered,

  -- By supplier (active only)
  COUNT(*) FILTER (WHERE s.supplier = 'AMC' AND t.status NOT IN ('DELIVERED', 'CLOSED')) as amc_active,
  COUNT(*) FILTER (WHERE s.supplier = 'HX' AND t.status NOT IN ('DELIVERED', 'CLOSED')) as hx_active,
  COUNT(*) FILTER (WHERE s.supplier = 'TJJSH' AND t.status NOT IN ('DELIVERED', 'CLOSED')) as tjjsh_active,
  COUNT(*) FILTER (WHERE s.supplier LIKE '%CLARK%' AND t.status NOT IN ('DELIVERED', 'CLOSED')) as clark_active
FROM shipments s
LEFT JOIN shipment_tracking t ON s.id = t.shipment_id;


-- 3c: in_transit_by_sku_week — already uses NOT IN ('DELIVERED','CLOSED'), no changes needed
-- (Included here for completeness / idempotency)
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


-- ═══════════════════════════════════════════
-- PART 4: NEW VIEWS
-- ═══════════════════════════════════════════

-- 4a: v_container_dispatch — Dispatcher Dashboard data source
-- Joins container_tracking + shipments + shipment_tracking + aggregated SKU info
CREATE OR REPLACE VIEW v_container_dispatch AS
SELECT
  ct.id,
  ct.shipment_id,
  ct.container_number,
  ct.container_type,
  ct.status,
  ct.picked_up_date,
  ct.scheduled_delivery_date,
  ct.delivered_date,
  ct.carrier,
  ct.warehouse,
  ct.delivery_reference,
  ct.notes,
  ct.status_history,
  ct.estimated_warehouse_date,
  -- Shipment info
  s.supplier,
  s.invoice_number,
  s.bol_number,
  s.etd,
  s.eta,
  -- Tracking info
  st.lfd,
  st.cleared_date,
  st.duty_amount,
  -- Aggregated SKU details per container
  (
    SELECT jsonb_agg(jsonb_build_object(
      'sku', sc.sku,
      'po_number', sc.po_number,
      'quantity', sc.quantity,
      'total_amount', sc.total_amount
    ))
    FROM shipment_containers sc
    WHERE sc.shipment_id = ct.shipment_id
      AND sc.container_number = ct.container_number
  ) as sku_summary,
  (
    SELECT COALESCE(SUM(sc.quantity), 0)
    FROM shipment_containers sc
    WHERE sc.shipment_id = ct.shipment_id
      AND sc.container_number = ct.container_number
  ) as total_quantity
FROM container_tracking ct
JOIN shipments s ON s.id = ct.shipment_id
LEFT JOIN shipment_tracking st ON st.shipment_id = ct.shipment_id;


-- 4b: inventory_dashboard — Pipeline Dashboard data source
-- Denormalized view of inventory_data + skus + weeks for frontend consumption
-- NOTE: This replaces Chris's 010_add_supplier_to_view.sql version, adding:
--   - supplier_code (from Chris's 010)
--   - sku_code, in_transit, consumption_source column (from our Phase 2C)
--   - get_actual_consumption() function for consistent consumption logic
DROP VIEW IF EXISTS inventory_dashboard;
CREATE VIEW inventory_dashboard AS
SELECT
  i.id,
  i.sku_id,
  s.part_model,
  s.description,
  s.category,
  s.supplier_code,
  s.sku_code,
  i.week_number,
  w.week_start_date,
  i.customer_forecast,
  get_actual_consumption(i.actual_consumption, i.customer_forecast) AS actual_consumption,
  (i.actual_consumption IS NOT NULL) AS consumption_is_manual,
  COALESCE(i.consumption_source,
    CASE WHEN i.actual_consumption IS NOT NULL THEN 'manual' ELSE 'forecast' END
  ) AS consumption_source,
  i.etd,
  i.ata,
  i.in_transit,
  i.defect,
  i.actual_inventory,
  CASE
    WHEN get_actual_consumption(i.actual_consumption, i.customer_forecast) > 0
    THEN ROUND(i.actual_inventory / get_actual_consumption(i.actual_consumption, i.customer_forecast), 2)
    ELSE NULL
  END AS weeks_on_hand
FROM inventory_data i
JOIN skus s ON i.sku_id = s.id
JOIN weeks w ON i.week_number = w.week_number
ORDER BY s.part_model, i.week_number;


-- ═══════════════════════════════════════════
-- PART 5: RPC FUNCTIONS (Phase 2C)
-- ═══════════════════════════════════════════

-- 5a: sync_in_transit_to_inventory()
-- Reads from in_transit_by_sku_week view and updates inventory_data.in_transit
-- Called via POST /api/inventory/in-transit
CREATE OR REPLACE FUNCTION sync_in_transit_to_inventory()
RETURNS TABLE(sku_code_out TEXT, week_out INTEGER, qty_out NUMERIC, status_out TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  matched_sku_id TEXT;
  update_count INTEGER := 0;
BEGIN
  -- Step 1: Clear all in_transit values
  UPDATE inventory_data SET in_transit = 0 WHERE in_transit != 0;

  -- Step 2: Read from in_transit_by_sku_week and update inventory_data
  FOR rec IN
    SELECT v.sku, v.expected_week, v.in_transit_qty, v.latest_status
    FROM in_transit_by_sku_week v
    WHERE v.expected_week > 0  -- Skip expired dates (week <= 0)
  LOOP
    -- Find matching sku_id via sku_code
    SELECT s.id INTO matched_sku_id
    FROM skus s
    WHERE s.sku_code = rec.sku
    LIMIT 1;

    IF matched_sku_id IS NOT NULL THEN
      -- Update inventory_data.in_transit for this SKU+week
      UPDATE inventory_data
      SET in_transit = COALESCE(in_transit, 0) + rec.in_transit_qty,
          updated_at = NOW()
      WHERE sku_id = matched_sku_id
        AND week_number = rec.expected_week;

      IF FOUND THEN
        update_count := update_count + 1;
        sku_code_out := rec.sku;
        week_out := rec.expected_week;
        qty_out := rec.in_transit_qty;
        status_out := 'updated';
        RETURN NEXT;
      ELSE
        sku_code_out := rec.sku;
        week_out := rec.expected_week;
        qty_out := rec.in_transit_qty;
        status_out := 'no_inventory_row';
        RETURN NEXT;
      END IF;
    ELSE
      sku_code_out := rec.sku;
      week_out := rec.expected_week;
      qty_out := rec.in_transit_qty;
      status_out := 'no_sku_match';
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;


-- 5b: deliver_shipment_to_inventory(p_shipment_id, p_delivered_date)
-- When a shipment is delivered to warehouse, update ATA in inventory_data
-- Called via POST /api/shipments/[id]/deliver and auto-called in tracking PATCH
CREATE OR REPLACE FUNCTION deliver_shipment_to_inventory(
  p_shipment_id UUID,
  p_delivered_date DATE
)
RETURNS TABLE(sku_code_out TEXT, sku_id_out TEXT, week_out INTEGER, qty_out NUMERIC, status_out TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  delivery_week INTEGER;
  rec RECORD;
  matched_sku_id TEXT;
BEGIN
  -- Calculate the delivery week
  delivery_week := get_week_number(p_delivered_date);

  IF delivery_week <= 0 THEN
    sku_code_out := 'ERROR';
    sku_id_out := '';
    week_out := delivery_week;
    qty_out := 0;
    status_out := 'invalid_week';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Aggregate quantities by SKU from shipment_containers
  FOR rec IN
    SELECT sc.sku, SUM(sc.quantity) as total_qty
    FROM shipment_containers sc
    WHERE sc.shipment_id = p_shipment_id
    GROUP BY sc.sku
  LOOP
    -- Find matching sku_id via sku_code
    SELECT s.id INTO matched_sku_id
    FROM skus s
    WHERE s.sku_code = rec.sku
    LIMIT 1;

    IF matched_sku_id IS NOT NULL THEN
      -- Add to ATA (cumulative, not replace)
      UPDATE inventory_data
      SET ata = COALESCE(ata, 0) + rec.total_qty,
          updated_at = NOW()
      WHERE sku_id = matched_sku_id
        AND week_number = delivery_week;

      IF FOUND THEN
        sku_code_out := rec.sku;
        sku_id_out := matched_sku_id;
        week_out := delivery_week;
        qty_out := rec.total_qty;
        status_out := 'delivered';
        RETURN NEXT;
      ELSE
        sku_code_out := rec.sku;
        sku_id_out := matched_sku_id;
        week_out := delivery_week;
        qty_out := rec.total_qty;
        status_out := 'no_inventory_row';
        RETURN NEXT;
      END IF;
    ELSE
      sku_code_out := rec.sku;
      sku_id_out := '';
      week_out := delivery_week;
      qty_out := rec.total_qty;
      status_out := 'no_sku_match';
      RETURN NEXT;
    END IF;
  END LOOP;

  -- After updating ATA, refresh in-transit data
  PERFORM sync_in_transit_to_inventory();

  RETURN;
END;
$$;


-- 5c: rollover_in_transit()
-- Move past-due in-transit quantities to the current week
-- Called via POST /api/inventory/rollover
CREATE OR REPLACE FUNCTION rollover_in_transit()
RETURNS TABLE(sku_code_out TEXT, from_week_out INTEGER, to_week_out INTEGER, qty_out NUMERIC, status_out TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  current_week INTEGER;
  rec RECORD;
  matched_sku_id TEXT;
BEGIN
  current_week := get_week_number(CURRENT_DATE);

  IF current_week <= 0 THEN
    sku_code_out := 'ERROR';
    from_week_out := 0;
    to_week_out := 0;
    qty_out := 0;
    status_out := 'invalid_current_week';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Find shipments expected in past weeks but not yet delivered
  FOR rec IN
    SELECT v.sku, v.expected_week, v.in_transit_qty, v.latest_status
    FROM in_transit_by_sku_week v
    WHERE v.expected_week > 0
      AND v.expected_week < current_week
  LOOP
    -- Find matching sku_id
    SELECT s.id INTO matched_sku_id
    FROM skus s
    WHERE s.sku_code = rec.sku
    LIMIT 1;

    IF matched_sku_id IS NOT NULL THEN
      -- Remove from old week
      UPDATE inventory_data
      SET in_transit = GREATEST(COALESCE(in_transit, 0) - rec.in_transit_qty, 0),
          updated_at = NOW()
      WHERE sku_id = matched_sku_id
        AND week_number = rec.expected_week;

      -- Add to current week
      UPDATE inventory_data
      SET in_transit = COALESCE(in_transit, 0) + rec.in_transit_qty,
          updated_at = NOW()
      WHERE sku_id = matched_sku_id
        AND week_number = current_week;

      -- Log the rollover
      INSERT INTO rollover_log (sku, from_week, to_week, expected_qty, rollover_qty)
      VALUES (rec.sku, rec.expected_week, current_week, rec.in_transit_qty, rec.in_transit_qty);

      sku_code_out := rec.sku;
      from_week_out := rec.expected_week;
      to_week_out := current_week;
      qty_out := rec.in_transit_qty;
      status_out := 'rolled_over';
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;


-- ═══════════════════════════════════════════
-- PART 6: ADD MISSING COLUMNS TO inventory_data
-- consumption_source: tracks where consumption data came from
-- ═══════════════════════════════════════════

ALTER TABLE inventory_data ADD COLUMN IF NOT EXISTS consumption_source TEXT;


-- ═══════════════════════════════════════════
-- PART 7: GRANT PERMISSIONS
-- Ensure anon and authenticated can access new objects
-- ═══════════════════════════════════════════

-- Table permissions
GRANT SELECT, INSERT, UPDATE ON container_tracking TO anon;
GRANT SELECT, INSERT, UPDATE ON container_tracking TO authenticated;

-- View permissions
GRANT SELECT ON v_container_dispatch TO anon;
GRANT SELECT ON v_container_dispatch TO authenticated;
GRANT SELECT ON inventory_dashboard TO anon;
GRANT SELECT ON inventory_dashboard TO authenticated;
GRANT SELECT ON shipment_overview TO anon;
GRANT SELECT ON shipment_overview TO authenticated;
GRANT SELECT ON shipment_dashboard_stats TO anon;
GRANT SELECT ON shipment_dashboard_stats TO authenticated;
GRANT SELECT ON in_transit_by_sku_week TO anon;
GRANT SELECT ON in_transit_by_sku_week TO authenticated;


-- ═══════════════════════════════════════════
-- DONE
-- Run this SQL in Supabase SQL Editor after 011
-- Execution order: 001-008 (inventory base) → 009 (AMC SKUs) → 010 (supplier_code)
--                  → 011 (master data + shipment tables) → 012 (this file)
--
-- Summary of objects created/modified:
--   MODIFIED: shipment_tracking (5-stage CHECK, new default, new column)
--   CREATED:  container_tracking table + indexes + RLS + 2 triggers
--   UPDATED:  shipment_overview view (5-stage ORDER BY)
--   UPDATED:  shipment_dashboard_stats view (5-stage counts + container stats)
--   CREATED:  v_container_dispatch view (Dispatcher Dashboard)
--   UPDATED:  inventory_dashboard view (adds sku_code, in_transit, keeps supplier_code)
--   CREATED:  sync_in_transit_to_inventory() function
--   CREATED:  deliver_shipment_to_inventory() function
--   CREATED:  rollover_in_transit() function
--   CREATED:  log_container_status_change() trigger function
--   CREATED:  sync_shipment_status_from_containers() trigger function
--   ADDED:    inventory_data.consumption_source column
--
-- NOTE: This migration changes shipment_tracking.status from 8-stage to 5-stage.
--   Old: SHIPPED→IN_TRANSIT→ARRIVED→CLEARED→PICKED_UP→SCHEDULED→DELIVERED→CLOSED
--   New: ON_WATER→CLEARED→DELIVERING→DELIVERED→CLOSED
--   The 8 date columns (shipped_date, departed_date, etc.) are preserved for history.
--   Chris's frontend components using old status values need updating after this migration.
-- ═══════════════════════════════════════════
