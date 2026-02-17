-- Migration 016: Add data_completeness column to shipments table
-- Supports partial shipment processing (Phase 3.9C)
-- "completed" = all required files present and parsed
-- "partial" = some files missing, partial data extracted

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS data_completeness TEXT DEFAULT 'completed';

-- Set all existing records to completed (they were fully processed)
UPDATE shipments SET data_completeness = 'completed' WHERE data_completeness IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN shipments.data_completeness IS 'Data completeness status: completed or partial. Partial means some source files were missing during processing.';
