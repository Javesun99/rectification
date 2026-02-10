import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user || user.password !== password) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const { password: _, ...userWithoutPassword } = user;
    
    // Explicitly handle null county to undefined to match optional UserPayload type
    const payload = {
        ...userWithoutPassword,
        county: userWithoutPassword.county || undefined
    };
    
    // Generate JWT
    const token = await signToken(payload);

    // Set Cookie
    const cookieStore = await cookies();
    cookieStore.set('token', token, {
      httpOnly: true,
      // If using HTTP (IP address), secure: true will block the cookie. 
      // Only enable secure if explicitly using HTTPS or a specific env var.
      secure: process.env.USE_HTTPS === 'true', 
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });

    return NextResponse.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
