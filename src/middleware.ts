import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  // 定义受保护的路径
  const protectedPaths = ['/batches', '/tasks', '/admin'];
  const path = request.nextUrl.pathname;

  // 检查当前路径是否受保护
  const isProtected = protectedPaths.some(p => path.startsWith(p));

  if (isProtected) {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      // 未登录，重定向到登录页，并携带来源 URL 以便登录后跳回
      const url = new URL('/login', request.url);
      url.searchParams.set('from', path);
      return NextResponse.redirect(url);
    }

    // 验证 Token 有效性
    const user = await verifyToken(token);
    if (!user) {
      // Token 无效，重定向到登录页
      const url = new URL('/login', request.url);
      url.searchParams.set('from', path);
      return NextResponse.redirect(url);
    }
    
    // 如果是 /admin 路径，还可以进一步校验角色
    if (path.startsWith('/admin') && user.role !== 'admin' && user.role !== 'superadmin') {
       // 权限不足，可以重定向到 403 或首页
       // 这里暂时不做强制阻断，交给页面逻辑处理，或者重定向到首页
       // return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

// 配置匹配路径，避免对静态资源等非必要路径运行中间件
export const config = {
  matcher: [
    '/batches/:path*', 
    '/tasks/:path*', 
    '/admin/:path*'
  ],
};
