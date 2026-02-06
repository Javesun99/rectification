import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.user.delete({
      where: { id: Number(id) }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { password, oldPassword } = body;

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    // Check old password if provided (for self-change)
    if (oldPassword) {
      const currentUser = await prisma.user.findUnique({ where: { id: Number(id) } });
      if (!currentUser || currentUser.password !== oldPassword) {
        return NextResponse.json({ error: '原密码错误' }, { status: 400 });
      }
    }

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: { password }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
