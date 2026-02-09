import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(user.id);
    const userRole = (user as any).role;

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const where: any = {};
    if (batchId) {
      where.batchId = Number(batchId);
      // Verify batch permission if specific batch requested
      if (userRole !== 'superadmin') {
        const batch = await prisma.importBatch.findUnique({ where: { id: Number(batchId) } });
        if (!batch || batch.creatorId !== userId) {
           return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }
      }
    } else if (userRole !== 'superadmin') {
      // If fetching all tasks, filter by batches owned by user
      where.batch = {
        creatorId: userId
      };
    }
    
    if (startDate || endDate) {
        where.submittedAt = {};
        if (startDate) {
            where.submittedAt.gte = new Date(startDate + 'T00:00:00.000Z');
        }
        if (endDate) {
            where.submittedAt.lte = new Date(endDate + 'T23:59:59.999Z');
        }
    }

    const tasks = await prisma.task.findMany({
      where,
      include: { batch: true },
      orderBy: { createdAt: 'desc' },
      take: 100 // Limit to last 100 for performance
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(user.id);
    const userRole = (user as any).role;

    const body = await request.json();
    const { batchId, data } = body;

    if (!batchId || !data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const batch = await prisma.importBatch.findUnique({ where: { id: Number(batchId) } });
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    // Permission Check
    if (userRole !== 'superadmin' && batch.creatorId !== userId) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const config = JSON.parse(batch.config_json);
    
    // Find county key
    const countyKey = Object.keys(config).find(key => config[key] === 'county');
    const county = countyKey ? data[countyKey] : 'Unknown';

    const task = await prisma.task.create({
      data: {
        batchId: Number(batchId),
        county: String(county),
        reference_json: JSON.stringify(data),
        status: 'pending'
      }
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
