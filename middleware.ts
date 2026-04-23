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

  // Already logged in on login page -> redirect appropriately based on role
  if (session && isLoginPage) {
    try {
      const sessionData = JSON.parse(session)
      // Viewer role goes directly to pipeline dashboard
      if (sessionData.role === 'viewer') {
        return NextResponse.redirect(new URL('/pipeline', request.url))
      }
    } catch {
      // If session parse fails, go to default
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Viewer role can only access pipeline page
  if (session && !isPublicPath) {
    try {
      const sessionData = JSON.parse(session)
      if (sessionData.role === 'viewer') {
        const allowedPaths = ['/pipeline', '/api/']
        const isAllowed = allowedPaths.some(path => request.nextUrl.pathname.startsWith(path))
        if (!isAllowed && request.nextUrl.pathname !== '/') {
          return NextResponse.redirect(new URL('/pipeline', request.url))
        }
        // Redirect viewer from home to pipeline
        if (request.nextUrl.pathname === '/') {
          return NextResponse.redirect(new URL('/pipeline', request.url))
        }
      }
    } catch {
      // If session parse fails, continue
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-.*|apple-icon.*).*)'],
}
