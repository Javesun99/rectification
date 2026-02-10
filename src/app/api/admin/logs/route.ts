import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user || (user as any).role !== 'superadmin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const logs = await prisma.loginLog.findMany({
      take: 100,
      orderBy: {
        loginAt: 'desc'
      },
      include: {
        user: {
          select: {
            username: true,
            role: true,
            county: true
          }
        }
      }
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Fetch logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
