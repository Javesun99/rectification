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
    // User: See all batches (so they can see tasks assigned to them). 
    //       Ideally, we should filter batches that actually contain tasks for this user's county?
    //       But current frontend logic in /batches/client.tsx expects to see all batches and then filters stats by county.
    //       So for now, let's allow 'user' role to see all batches (read-only).
    
    let whereClause = {};

    if (userRole === 'admin') {
      whereClause = { creatorId: userId };
    } else {
      // superadmin OR user -> see all
      // For user, maybe we want to restrict to only batches that have tasks for their county?
      // But let's keep it simple for now to fix the visibility issue.
      whereClause = {};
    }

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
