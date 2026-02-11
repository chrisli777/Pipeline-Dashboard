import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET_NAME = 'forecast-files'

// GET - List all forecast files
export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('forecast_files')
      .select('id, file_name, file_path, file_size, mime_type, uploaded_at, customer, notes')
      .order('uploaded_at', { ascending: false })
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ files: data || [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch files' },
      { status: 500 }
    )
  }
}

// POST - Upload file to Supabase Storage
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const customer = formData.get('customer') as string || null
    const notes = formData.get('notes') as string || null
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    const supabase = await createClient()
    
    // Generate unique file path
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${timestamp}_${sanitizedName}`
    
    // Upload to Supabase Storage (binary)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      })
    
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }
    
    // Save metadata to database
    const { data, error: dbError } = await supabase
      .from('forecast_files')
      .insert({
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        customer,
        notes,
      })
      .select('id, file_name, file_path, file_size, mime_type, uploaded_at, customer, notes')
      .single()
    
    if (dbError) {
      // Rollback: delete uploaded file if database insert fails
      await supabase.storage.from(BUCKET_NAME).remove([filePath])
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, file: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to upload file' },
      { status: 500 }
    )
  }
}

// DELETE - Delete file from Storage and database
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'File ID required' }, { status: 400 })
    }
    
    const supabase = await createClient()
    
    // Get file path first
    const { data: fileData, error: fetchError } = await supabase
      .from('forecast_files')
      .select('file_path')
      .eq('id', id)
      .single()
    
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }
    
    // Delete from Storage
    if (fileData?.file_path) {
      await supabase.storage.from(BUCKET_NAME).remove([fileData.file_path])
    }
    
    // Delete from database
    const { error: deleteError } = await supabase
      .from('forecast_files')
      .delete()
      .eq('id', id)
    
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete file' },
      { status: 500 }
    )
  }
}
