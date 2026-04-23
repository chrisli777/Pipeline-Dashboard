import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const { username, password } = await request.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
  }

  // Use service role key to bypass RLS
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createSupabaseAdmin(supabaseUrl, supabaseServiceKey)

  const { data, error } = await supabase.rpc('verify_user_password', {
    p_username: username,
    p_password: password,
  })

  console.log('[v0] Login RPC result:', { data, error: error?.message, username })

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const userRole = data[0].role || 'admin'
  const response = NextResponse.json({ success: true, username: data[0].username, role: userRole })
  response.cookies.set('whi_session', JSON.stringify({ user_id: data[0].user_id, username: data[0].username, role: userRole }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // No maxAge = session cookie, expires when browser/tab closes
  })
  return response
}
