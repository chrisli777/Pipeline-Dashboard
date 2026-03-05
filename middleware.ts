import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const session = request.cookies.get('whi_session')?.value
  const isLoginPage = request.nextUrl.pathname === '/login'

  // Not logged in and not on login page -> redirect to login
  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Logged in and on login page -> redirect to dashboard
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icon-.*|apple-icon|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
