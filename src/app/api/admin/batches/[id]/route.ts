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
    const batchId = Number(id);

    // Permission Check
    if (userRole !== 'superadmin') {
      const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
      if (!batch) {
        return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
      }
      if (batch.creatorId !== userId) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }
    }

    await prisma.importBatch.delete({
      where: { id: batchId }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete batch error:', error);
    return NextResponse.json({ error: 'Failed to delete batch' }, { status: 500 });
  }
}
