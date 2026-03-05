import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const { username, password } = await request.json()

  // Use service role to query app_users table directly
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase.rpc('verify_user_password', {
    p_username: username,
    p_password: password,
  })

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('whi_session', data, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
  return response
}
