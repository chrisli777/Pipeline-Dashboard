import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const session = request.cookies.get('whi_session')?.value
  const isLoginPage = request.nextUrl.pathname === '/login'
  const isPublicPath =
    isLoginPage ||
    request.nextUrl.pathname.startsWith('/api/') ||
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname.includes('.')

  // Not logged in -> redirect to login
  if (!session && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Already logged in on login page -> redirect to dashboard
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-.*|apple-icon.*).*)'],
}
