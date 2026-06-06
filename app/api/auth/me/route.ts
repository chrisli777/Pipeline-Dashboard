import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const session = cookieStore.get('whi_session')?.value

  if (!session) {
    return NextResponse.json({ authenticated: false, role: null, username: null })
  }

  try {
    const parsed = JSON.parse(session)
    return NextResponse.json({
      authenticated: true,
      role: parsed.role || 'admin',
      username: parsed.username || null,
    })
  } catch {
    return NextResponse.json({ authenticated: false, role: null, username: null })
  }
}
