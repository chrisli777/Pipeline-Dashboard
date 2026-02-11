import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET_NAME = 'forecast-files'

// GET - Download file via Signed URL redirect
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // Get file path from database
  const { data: fileData, error: dbError } = await supabase
    .from('forecast_files')
    .select('file_path')
    .eq('id', id)
    .single()

  if (dbError || !fileData) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Create signed URL (valid for 60 seconds)
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(fileData.file_path, 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Failed to create signed url' }, { status: 500 })
  }

  // Return signed URL as JSON (let frontend handle the redirect)
  return NextResponse.json({ signedUrl: data.signedUrl })
}
