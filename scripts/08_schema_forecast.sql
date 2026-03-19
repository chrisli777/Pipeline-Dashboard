-- Create forecast_files table with all columns
CREATE TABLE IF NOT EXISTS forecast_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uploaded_by TEXT,
  customer TEXT,
  notes TEXT,
  file_content TEXT,
  mime_type TEXT DEFAULT 'application/pdf'
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_forecast_files_uploaded_at ON forecast_files(uploaded_at DESC);
