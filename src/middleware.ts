import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Paths to protect
  const protectedPaths = ['/admin', '/batches', '/tasks'];
  const isProtected = protectedPaths.some(path => pathname.startsWith(path));

  if (isProtected) {
    const token = request.cookies.get('token')?.value;

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Role-based protection for /admin
    if (pathname.startsWith('/admin')) {
      const role = payload.role;
      if (role !== 'admin' && role !== 'superadmin') {
        // Redirect regular users to their dashboard if they try to access admin
        // Or show a 403 page. Here we redirect to batches.
        return NextResponse.redirect(new URL('/batches', request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/batches/:path*', '/tasks/:path*'],
};
