-- ===========================================================================
-- 015: Phase 3B — Safety Stock, Lead Times, Reorder Points & Enhanced View
--
-- Prerequisites: 001-014 must have been run
-- ===========================================================================


-- =============================================
-- PART 1: Z-Score lookup function
-- =============================================

CREATE OR REPLACE FUNCTION z_score(p_service_level NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN CASE
    WHEN p_service_level >= 0.99 THEN 2.33
    WHEN p_service_level >= 0.98 THEN 2.05
    WHEN p_service_level >= 0.97 THEN 1.88
    WHEN p_service_level >= 0.96 THEN 1.75
    WHEN p_service_level >= 0.95 THEN 1.65
    WHEN p_service_level >= 0.94 THEN 1.55
    WHEN p_service_level >= 0.93 THEN 1.48
    WHEN p_service_level >= 0.92 THEN 1.41
    WHEN p_service_level >= 0.91 THEN 1.34
    WHEN p_service_level >= 0.90 THEN 1.28
    WHEN p_service_level >= 0.85 THEN 1.04
    WHEN p_service_level >= 0.80 THEN 0.84
    ELSE 0.67
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- =============================================
-- PART 2: Set Lead Time per supplier
-- =============================================
-- AMC: production 70 days (10 weeks) + shipping 6 weeks = 16 weeks
-- Others: production 30-40 days (5 weeks) + shipping 6 weeks = 11 weeks

UPDATE skus SET lead_time_weeks = 16
WHERE supplier_code = 'AMC' AND abc_class IS NOT NULL AND (lead_time_weeks IS NULL OR lead_time_weeks = 0);

UPDATE skus SET lead_time_weeks = 11
WHERE supplier_code IN ('HX', 'ZhongXing', 'TianJin', 'WINSCHEM', 'Nuode')
  AND abc_class IS NOT NULL AND (lead_time_weeks IS NULL OR lead_time_weeks = 0);


-- =============================================
-- PART 3: Set MOQ defaults
-- =============================================
-- Use qty_per_container if available, otherwise default to 1

UPDATE skus SET moq = COALESCE(qty_per_container, 1)
WHERE abc_class IS NOT NULL AND (moq IS NULL OR moq = 0);


-- =============================================
-- PART 4: Compute Safety Stock (in weeks) and Reorder Point (in units)
-- =============================================
-- SS (units) = Z(service_level) * sigma_demand * sqrt(lead_time) * multiplier
-- sigma_demand  = avg_weekly_demand * cv_demand
-- SS_weeks  = SS_units / avg_weekly_demand
-- ROP       = avg_weekly_demand * lead_time + SS_units

UPDATE skus s SET
  safety_stock_weeks = CASE
    WHEN s.avg_weekly_demand > 0 AND s.lead_time_weeks > 0
    THEN ROUND(
      z_score(cp.service_level)
      * COALESCE(s.cv_demand, 0.5)
      * SQRT(s.lead_time_weeks::NUMERIC)
      * COALESCE(cp.safety_stock_multiplier, 1.0),
      1
    )
    ELSE 0
  END,
  reorder_point = CASE
    WHEN s.avg_weekly_demand > 0 AND s.lead_time_weeks > 0
    THEN ROUND(
      s.avg_weekly_demand * s.lead_time_weeks
      + z_score(cp.service_level)
        * (s.avg_weekly_demand * COALESCE(s.cv_demand, 0.5))
        * SQRT(s.lead_time_weeks::NUMERIC)
        * COALESCE(cp.safety_stock_multiplier, 1.0),
      0
    )
    ELSE 0
  END
FROM classification_policies cp
WHERE cp.matrix_cell = COALESCE(s.abc_class, '') || COALESCE(s.xyz_class, '')
  AND s.abc_class IS NOT NULL;


-- =============================================
-- PART 5: Enhanced view with policy columns
-- =============================================

CREATE OR REPLACE VIEW v_sku_classification AS
SELECT
  s.id,
  s.sku_code,
  s.part_model,
  s.description,
  s.supplier_code,
  s.abc_class,
  s.xyz_class,
  COALESCE(s.abc_class, '') || COALESCE(s.xyz_class, '') AS matrix_cell,
  s.unit_cost,
  s.annual_consumption_value,
  s.avg_weekly_demand,
  s.cv_demand,
  s.safety_stock_weeks,
  s.reorder_point,
  s.moq,
  s.lead_time_weeks,
  s.unit_weight,
  s.qty_per_container,
  s.dimensions_cbm,
  s.length_in,
  s.width_in,
  s.height_in,
  -- Policy fields from classification_policies
  cp.service_level,
  cp.target_woh,
  cp.safety_stock_multiplier,
  cp.replenishment_method,
  cp.review_frequency
FROM skus s
LEFT JOIN classification_policies cp
  ON cp.matrix_cell = COALESCE(s.abc_class, '') || COALESCE(s.xyz_class, '')
WHERE s.abc_class IS NOT NULL
ORDER BY
  CASE s.abc_class WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,
  CASE s.xyz_class WHEN 'X' THEN 1 WHEN 'Y' THEN 2 ELSE 3 END,
  s.annual_consumption_value DESC NULLS LAST;


-- =============================================
-- PART 6: Grant permissions
-- =============================================

GRANT EXECUTE ON FUNCTION z_score(NUMERIC) TO authenticated;
GRANT SELECT ON v_sku_classification TO authenticated;
