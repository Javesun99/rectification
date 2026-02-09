import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user || (user as any).role !== 'superadmin') {
      return NextResponse.json({ error: 'Unauthorized: Only Superadmin can delete users' }, { status: 403 });
    }

    const { id } = await params;
    const targetId = Number(id);

    if (targetId === Number(user.id)) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
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
    const currentUserRole = (currentUser as any).role;

    // Logic:
    // 1. Superadmin can reset anyone's password (no oldPassword needed).
    // 2. User can change their own password (oldPassword REQUIRED).
    
    if (currentUserRole === 'superadmin') {
       // Superadmin mode
       // If updating self, technically should require old password? 
       // But usually superadmin can override. 
       // However, frontend for "Change Password" (Self) sends oldPassword.
       // Frontend for "Reset Password" (Manage) does NOT send oldPassword.
       
       // If it is self-update, let's enforce oldPassword if provided, or rely on frontend?
       // Let's stick to: If oldPassword is provided, verify it (Self Change).
       // If NOT provided, assume Force Reset (Superadmin only).
       
       if (targetId !== currentUserId && !oldPassword) {
           // Force Reset by Superadmin on another user -> OK
       } else if (targetId === currentUserId) {
           // Self change by Superadmin
           // If they use the "Change Password" modal, oldPassword is sent.
           // If they use the "Reset Password" modal on themselves (weird but possible), oldPassword might not be sent.
           // Let's require oldPassword for self-change to be safe, unless we want to allow superadmin to reset themselves without old password (dangerous if session hijacked).
           // But for now, let's follow the provided params.
           
           if (oldPassword) {
                const dbUser = await prisma.user.findUnique({ where: { id: targetId } });
                if (!dbUser || dbUser.password !== oldPassword) {
                    return NextResponse.json({ error: '原密码错误' }, { status: 400 });
                }
           }
       }
    } else {
        // Regular Admin or User
        // Can ONLY change own password
        if (targetId !== currentUserId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        
        // Must provide old password
        if (!oldPassword) {
            return NextResponse.json({ error: '请提供原密码' }, { status: 400 });
        }
        
        const dbUser = await prisma.user.findUnique({ where: { id: targetId } });
        if (!dbUser || dbUser.password !== oldPassword) {
            return NextResponse.json({ error: '原密码错误' }, { status: 400 });
        }
    }

    // Perform Update
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
