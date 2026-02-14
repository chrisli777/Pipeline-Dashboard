-- ═══════════════════════════════════════════════════════════════════════════
-- 013: Phase 2D — ETD Pipeline Integration + Dual Rollover Redesign
--
-- This migration:
--   Part 1: Create etd_by_sku_week view (ETD quantities by SKU+week)
--   Part 2: Update in_transit_by_sku_week view (container-level awareness)
--   Part 3: Create sync_and_rollover_inventory() — replaces sync + rollover
--   Part 4: Create deliver_container_to_inventory() — per-container delivery
--   Part 5: Update deliver_shipment_to_inventory() — use new sync function
--   Part 6: Add 'reason' column to rollover_log
--   Part 7: Grant permissions
--
-- Prerequisites: 001-012 must have been run
-- Key change: Clear-and-Recompute approach for idempotent rollover
--   - ETD Rollover: ship delay, partial vessel rollover, production delay
--   - ETA/In-Transit Rollover: partial delivery (5/10 containers), port delay
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════
-- PART 1: etd_by_sku_week VIEW (NEW)
-- Shows ETD quantities grouped by SKU + departure week
-- Container-level aware: excludes containers already DELIVERED/CLOSED
-- ═══════════════════════════════════════════

CREATE OR REPLACE VIEW etd_by_sku_week AS
SELECT
  sc.sku,
  get_week_number(s.etd) as departure_week,
  s.etd as expected_departure,
  SUM(sc.quantity) as etd_qty,
  COUNT(DISTINCT sc.container_number) as container_count,
  ARRAY_AGG(DISTINCT s.invoice_number) as invoice_numbers,
  MAX(t.status) as latest_status
FROM shipment_containers sc
JOIN shipments s ON sc.shipment_id = s.id
LEFT JOIN shipment_tracking t ON s.id = t.shipment_id
LEFT JOIN container_tracking ct
  ON ct.shipment_id = sc.shipment_id
  AND ct.container_number = sc.container_number
WHERE
  s.etd IS NOT NULL
  -- Exclude shipments fully delivered/closed
  AND (t.status IS NULL OR t.status NOT IN ('DELIVERED', 'CLOSED'))
  -- Exclude containers already delivered/closed (partial delivery support)
  AND (ct.id IS NULL OR ct.status NOT IN ('DELIVERED', 'CLOSED'))
GROUP BY sc.sku, s.etd
ORDER BY sc.sku, s.etd;


-- ═══════════════════════════════════════════
-- PART 2: UPDATE in_transit_by_sku_week VIEW
-- Add container_tracking JOIN to exclude delivered containers
-- This enables partial delivery awareness:
--   e.g., 10 containers arrive, 5 delivered → only 5 remain in-transit
-- ═══════════════════════════════════════════

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
LEFT JOIN container_tracking ct
  ON ct.shipment_id = sc.shipment_id
  AND ct.container_number = sc.container_number
WHERE
  s.eta IS NOT NULL
  -- Exclude shipments fully delivered/closed
  AND (t.status IS NULL OR t.status NOT IN ('DELIVERED', 'CLOSED'))
  -- Exclude containers already delivered/closed
  AND (ct.id IS NULL OR ct.status NOT IN ('DELIVERED', 'CLOSED'))
GROUP BY sc.sku, s.eta
ORDER BY sc.sku, s.eta;


-- ═══════════════════════════════════════════
-- PART 3: sync_and_rollover_inventory() (NEW)
-- Replaces both sync_in_transit_to_inventory() and rollover_in_transit()
-- Clear-and-Recompute approach: always idempotent, no double-counting
--
-- Steps:
--   1. Clear all inventory_data.etd and in_transit to 0
--   2. Populate ETD from etd_by_sku_week (rollover past weeks → current)
--   3. Populate in_transit from in_transit_by_sku_week (rollover past → current)
--   4. Log rollovers to rollover_log
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_and_rollover_inventory()
RETURNS TABLE(
  sku_code_out TEXT,
  week_out INTEGER,
  original_week_out INTEGER,
  qty_out NUMERIC,
  field_out TEXT,
  status_out TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
  current_wk INTEGER;
  rec RECORD;
  matched_sku_id TEXT;
  target_wk INTEGER;
BEGIN
  current_wk := get_week_number(CURRENT_DATE);

  IF current_wk <= 0 THEN
    sku_code_out := 'ERROR';
    week_out := current_wk;
    original_week_out := 0;
    qty_out := 0;
    field_out := 'system';
    status_out := 'invalid_current_week';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Clean today's rollover log entries for idempotency
  DELETE FROM rollover_log WHERE created_at::date = CURRENT_DATE;

  -- ─── Step 1: Clear ETD and In-Transit ───
  UPDATE inventory_data SET etd = 0 WHERE etd IS DISTINCT FROM 0;
  UPDATE inventory_data SET in_transit = 0 WHERE in_transit IS DISTINCT FROM 0;

  -- ─── Step 2: Populate ETD (with rollover) ───
  FOR rec IN
    SELECT v.sku, v.departure_week, v.etd_qty
    FROM etd_by_sku_week v
    WHERE v.departure_week > 0
  LOOP
    -- Find matching SKU
    SELECT s.id INTO matched_sku_id
    FROM skus s
    WHERE s.sku_code = rec.sku
    LIMIT 1;

    IF matched_sku_id IS NULL THEN
      sku_code_out := rec.sku;
      week_out := rec.departure_week;
      original_week_out := rec.departure_week;
      qty_out := rec.etd_qty;
      field_out := 'etd';
      status_out := 'no_sku_match';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Rollover: past weeks → current week
    target_wk := CASE
      WHEN rec.departure_week < current_wk THEN current_wk
      ELSE rec.departure_week
    END;

    -- Update inventory_data
    UPDATE inventory_data
    SET etd = COALESCE(etd, 0) + rec.etd_qty,
        updated_at = NOW()
    WHERE sku_id = matched_sku_id
      AND week_number = target_wk;

    IF FOUND THEN
      -- Log rollover if applicable
      IF rec.departure_week < current_wk THEN
        INSERT INTO rollover_log (sku, from_week, to_week, expected_qty, rollover_qty, reason)
        VALUES (rec.sku, rec.departure_week, current_wk, rec.etd_qty, rec.etd_qty, 'etd_rollover');
      END IF;

      sku_code_out := rec.sku;
      week_out := target_wk;
      original_week_out := rec.departure_week;
      qty_out := rec.etd_qty;
      field_out := 'etd';
      status_out := CASE
        WHEN rec.departure_week < current_wk THEN 'rolled_over'
        ELSE 'updated'
      END;
      RETURN NEXT;
    ELSE
      sku_code_out := rec.sku;
      week_out := target_wk;
      original_week_out := rec.departure_week;
      qty_out := rec.etd_qty;
      field_out := 'etd';
      status_out := 'no_inventory_row';
      RETURN NEXT;
    END IF;
  END LOOP;

  -- ─── Step 3: Populate In-Transit (with rollover) ───
  FOR rec IN
    SELECT v.sku, v.expected_week, v.in_transit_qty
    FROM in_transit_by_sku_week v
    WHERE v.expected_week > 0
  LOOP
    -- Find matching SKU
    SELECT s.id INTO matched_sku_id
    FROM skus s
    WHERE s.sku_code = rec.sku
    LIMIT 1;

    IF matched_sku_id IS NULL THEN
      sku_code_out := rec.sku;
      week_out := rec.expected_week;
      original_week_out := rec.expected_week;
      qty_out := rec.in_transit_qty;
      field_out := 'in_transit';
      status_out := 'no_sku_match';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Rollover: past weeks → current week
    target_wk := CASE
      WHEN rec.expected_week < current_wk THEN current_wk
      ELSE rec.expected_week
    END;

    -- Update inventory_data
    UPDATE inventory_data
    SET in_transit = COALESCE(in_transit, 0) + rec.in_transit_qty,
        updated_at = NOW()
    WHERE sku_id = matched_sku_id
      AND week_number = target_wk;

    IF FOUND THEN
      -- Log rollover if applicable
      IF rec.expected_week < current_wk THEN
        INSERT INTO rollover_log (sku, from_week, to_week, expected_qty, rollover_qty, reason)
        VALUES (rec.sku, rec.expected_week, current_wk, rec.in_transit_qty, rec.in_transit_qty, 'in_transit_rollover');
      END IF;

      sku_code_out := rec.sku;
      week_out := target_wk;
      original_week_out := rec.expected_week;
      qty_out := rec.in_transit_qty;
      field_out := 'in_transit';
      status_out := CASE
        WHEN rec.expected_week < current_wk THEN 'rolled_over'
        ELSE 'updated'
      END;
      RETURN NEXT;
    ELSE
      sku_code_out := rec.sku;
      week_out := target_wk;
      original_week_out := rec.expected_week;
      qty_out := rec.in_transit_qty;
      field_out := 'in_transit';
      status_out := 'no_inventory_row';
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;


-- ═══════════════════════════════════════════
-- PART 4: deliver_container_to_inventory() (NEW)
-- Per-container delivery: when Dispatcher marks a single container DELIVERED,
-- update inventory_data.ata for the SKUs in that container,
-- then re-sync ETD + in-transit via sync_and_rollover_inventory()
-- ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION deliver_container_to_inventory(
  p_shipment_id UUID,
  p_container_number TEXT,
  p_delivered_date DATE
)
RETURNS TABLE(
  sku_code_out TEXT,
  sku_id_out TEXT,
  week_out INTEGER,
  qty_out NUMERIC,
  status_out TEXT
)
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

  -- Get SKU quantities for this specific container
  FOR rec IN
    SELECT sc.sku, SUM(sc.quantity) as total_qty
    FROM shipment_containers sc
    WHERE sc.shipment_id = p_shipment_id
      AND sc.container_number = p_container_number
    GROUP BY sc.sku
  LOOP
    -- Find matching sku_id
    SELECT s.id INTO matched_sku_id
    FROM skus s
    WHERE s.sku_code = rec.sku
    LIMIT 1;

    IF matched_sku_id IS NOT NULL THEN
      -- Add to ATA (cumulative)
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

  -- Refresh ETD + in-transit after delivery
  PERFORM sync_and_rollover_inventory();

  RETURN;
END;
$$;


-- ═══════════════════════════════════════════
-- PART 5: UPDATE deliver_shipment_to_inventory()
-- Change: call sync_and_rollover_inventory() instead of sync_in_transit_to_inventory()
-- ═══════════════════════════════════════════

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

  -- Aggregate quantities by SKU from all containers in this shipment
  FOR rec IN
    SELECT sc.sku, SUM(sc.quantity) as total_qty
    FROM shipment_containers sc
    WHERE sc.shipment_id = p_shipment_id
    GROUP BY sc.sku
  LOOP
    SELECT s.id INTO matched_sku_id
    FROM skus s
    WHERE s.sku_code = rec.sku
    LIMIT 1;

    IF matched_sku_id IS NOT NULL THEN
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

  -- Refresh ETD + in-transit (replaces old sync_in_transit_to_inventory call)
  PERFORM sync_and_rollover_inventory();

  RETURN;
END;
$$;


-- ═══════════════════════════════════════════
-- PART 6: ADD 'reason' COLUMN TO rollover_log
-- Tracks whether rollover was ETD or in-transit
-- ═══════════════════════════════════════════

ALTER TABLE rollover_log ADD COLUMN IF NOT EXISTS reason TEXT;

-- Add index for reason-based queries
CREATE INDEX IF NOT EXISTS idx_rollover_log_reason
  ON rollover_log(reason) WHERE reason IS NOT NULL;


-- ═══════════════════════════════════════════
-- PART 7: GRANT PERMISSIONS
-- ═══════════════════════════════════════════

-- New view permissions
GRANT SELECT ON etd_by_sku_week TO anon;
GRANT SELECT ON etd_by_sku_week TO authenticated;

-- Refresh existing view permissions (views were recreated)
GRANT SELECT ON in_transit_by_sku_week TO anon;
GRANT SELECT ON in_transit_by_sku_week TO authenticated;


-- ═══════════════════════════════════════════
-- DONE
-- Run this SQL in Supabase SQL Editor after 012
-- Execution order: 001-012 → 013 (this file)
--
-- Summary of objects created/modified:
--   CREATED:  etd_by_sku_week view (ETD quantities by SKU+week, container-aware)
--   UPDATED:  in_transit_by_sku_week view (added container_tracking JOIN)
--   CREATED:  sync_and_rollover_inventory() function (replaces sync + rollover)
--   CREATED:  deliver_container_to_inventory() function (per-container delivery)
--   UPDATED:  deliver_shipment_to_inventory() function (uses new sync function)
--   ADDED:    rollover_log.reason column
--
-- After running:
--   1. SELECT * FROM etd_by_sku_week;  -- verify ETD data
--   2. SELECT * FROM sync_and_rollover_inventory();  -- populate inventory_data
--   3. Check Pipeline Dashboard ETD row shows quantities
-- ═══════════════════════════════════════════
