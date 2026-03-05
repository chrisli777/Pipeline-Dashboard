import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { username, password } = await request.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('verify_user_password', {
    p_username: username,
    p_password: password,
  })

  console.log('[v0] Login attempt:', { username, data, error: error?.message })

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: error?.message || 'Invalid username or password' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true, username: data[0].username })
  response.cookies.set('whi_session', JSON.stringify({ user_id: data[0].user_id, username: data[0].username }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
  return response
}
