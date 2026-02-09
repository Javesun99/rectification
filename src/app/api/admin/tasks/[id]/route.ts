import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(user.id);
    const userRole = (user as any).role;

    const { id } = await params;
    const taskId = Number(id);

    // Permission Check
    if (userRole !== 'superadmin') {
      const task = await prisma.task.findUnique({ 
        where: { id: taskId },
        include: { batch: true }
      });
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      if (task.batch.creatorId !== userId) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }
    }

    await prisma.task.delete({
      where: { id: taskId }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = Number(user.id);
    const userRole = (user as any).role;

    const { id } = await params;
    const taskId = Number(id);
    const body = await request.json();
    
    // Permission Check
    if (userRole !== 'superadmin') {
      const task = await prisma.task.findUnique({ 
        where: { id: taskId },
        include: { batch: true }
      });
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      if (task.batch.creatorId !== userId) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }
    }

    // We expect submission_json in the body
    if (body.submission_json) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          submission_json: body.submission_json
        }
      });
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'No data to update' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
