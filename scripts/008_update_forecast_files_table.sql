-- Update forecast_files table to store file content directly
ALTER TABLE forecast_files ADD COLUMN IF NOT EXISTS file_content TEXT;

-- Add mime_type column
ALTER TABLE forecast_files ADD COLUMN IF NOT EXISTS mime_type TEXT DEFAULT 'application/pdf';
