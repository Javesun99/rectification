'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!username || !password) return alert('请输入用户名和密码');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.ok) {
        // Auth handled by HttpOnly cookie now.
        // We still need role/county to decide where to redirect, which is in data.user

        // Remove old localStorage item if exists to avoid confusion
        localStorage.removeItem('user');

        if (data.user.role === 'admin' || data.user.role === 'superadmin') {
          router.push('/admin');
        } else {
          router.push(`/batches?county=${encodeURIComponent(data.user.county || '')}`);
        }
      } else {
        alert(data.error || '登录失败');
      }
    } catch (e) {
      alert('登录请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-background md:shadow-xl">
      <div className="z-10 w-full max-w-md">
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="text-center">机房整改系统登录</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <input
                        placeholder="用户名"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <input
                        type="password"
                        placeholder="密码"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Button onClick={handleLogin} className="w-full" disabled={loading}>
                        {loading ? '登录中...' : '进入系统'}
                    </Button>
                </div>
            </CardContent>
        </Card>
      </div>

      {/* Retro Grid Background Effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden [perspective:200px]">
        <div className="absolute inset-0 [transform:rotateX(35deg)]">
          <div className="animate-grid [background-repeat:repeat] [background-size:60px_60px] [height:300vh] [inset:0%_0px] [margin-left:-50%] [transform-origin:100%_0_0] [width:600vw] [background-image:linear-gradient(to_right,rgba(0,0,0,0.3)_1px,transparent_0),linear-gradient(to_bottom,rgba(0,0,0,0.3)_1px,transparent_0)] dark:[background-image:linear-gradient(to_right,rgba(255,255,255,0.2)_1px,transparent_0),linear-gradient(to_bottom,rgba(255,255,255,0.2)_1px,transparent_0)]" />
        </div>
      </div>
    </div>
  );
}
