import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(user.id);
    const userRole = (user as any).role;

    // Filter Logic:
    // Superadmin: See all
    // Admin: See only own batches (creatorId = userId)
    // User: This API shouldn't be accessed by user, but if so, maybe empty? (Middleware protects /admin/*)
    
    const whereClause = userRole === 'superadmin' 
      ? {} 
      : { creatorId: userId };

    const batches = await prisma.importBatch.findMany({
      where: whereClause,
      include: {
        tasks: {
          select: {
            county: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Process statistics
    const result = batches.map(batch => {
      const statsByCounty: Record<string, { total: number; submitted: number }> = {};
      
      batch.tasks.forEach(task => {
        if (!statsByCounty[task.county]) {
          statsByCounty[task.county] = { total: 0, submitted: 0 };
        }
        statsByCounty[task.county].total++;
        if (task.status === 'submitted') {
          statsByCounty[task.county].submitted++;
        }
      });

      return {
        ...batch,
        tasks: undefined, // Remove raw tasks to reduce payload
        stats: statsByCounty,
        totalTasks: batch.tasks.length
      };
    });

    return NextResponse.json({ batches: result });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 });
  }
}
