import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = ['/login', '/api/auth'];

// Static assets and Next.js internals that should be excluded
const excludedPaths = ['/_next', '/favicon', '/fonts', '/images'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets and Next.js internals
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Skip middleware for public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get('vault-auth');
  
  if (!authCookie || authCookie.value !== 'authenticated') {
    // Redirect to login page
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
