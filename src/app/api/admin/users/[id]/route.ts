import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user || (user.role !== 'superadmin' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const targetId = Number(id);

    if (targetId === Number(user.id)) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
    }

    if (user.role === 'admin') {
      const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
      if (!targetUser || targetUser.role !== 'user') {
        return NextResponse.json({ error: '管理员只能删除普通用户' }, { status: 403 });
      }
    }

    await prisma.user.delete({
      where: { id: targetId }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const currentUser = token ? await verifyToken(token) : null;

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const targetId = Number(id);
    const body = await request.json();
    const { password, oldPassword } = body;

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const currentUserId = Number(currentUser.id);
    const currentUserRole = currentUser.role;

    if (currentUserRole === 'superadmin') {
      if (targetId === currentUserId && oldPassword) {
        const dbUser = await prisma.user.findUnique({ where: { id: targetId } });
        if (!dbUser || dbUser.password !== oldPassword) {
          return NextResponse.json({ error: '原密码错误' }, { status: 400 });
        }
      }
    } else if (currentUserRole === 'admin') {
      if (targetId === currentUserId) {
        if (!oldPassword) {
          return NextResponse.json({ error: '请提供原密码' }, { status: 400 });
        }
        const dbUser = await prisma.user.findUnique({ where: { id: targetId } });
        if (!dbUser || dbUser.password !== oldPassword) {
          return NextResponse.json({ error: '原密码错误' }, { status: 400 });
        }
      } else {
        const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
        if (!targetUser || targetUser.role !== 'user') {
          return NextResponse.json({ error: '管理员只能重置普通用户密码' }, { status: 403 });
        }
      }
    } else {
      if (targetId !== currentUserId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!oldPassword) {
        return NextResponse.json({ error: '请提供原密码' }, { status: 400 });
      }
      const dbUser = await prisma.user.findUnique({ where: { id: targetId } });
      if (!dbUser || dbUser.password !== oldPassword) {
        return NextResponse.json({ error: '原密码错误' }, { status: 400 });
      }
    }

    await prisma.user.update({
      where: { id: targetId },
      data: { password }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
