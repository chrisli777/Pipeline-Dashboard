import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-light-32x32.png|icon-dark-32x32.png|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
