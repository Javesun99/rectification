'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function BatchesContent() {
  const searchParams = useSearchParams();
  const county = searchParams.get('county');
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
  const router = useRouter();

  useEffect(() => {
    // Check authentication via server
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Unauthorized');
      })
      .then(data => {
        if (data.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {
        router.push('/login');
      });

    fetch('/api/admin/batches')
      .then(res => res.json())
      .then(data => {
        if (data.batches) setBatches(data.batches);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [router]);

  const handleChangePassword = async () => {
    if (!passwordData.newPassword || !passwordData.confirmPassword) return alert('请输入密码');
    if (passwordData.newPassword !== passwordData.confirmPassword) return alert('两次输入密码不一致');

    try {
      const res = await fetch(`/api/admin/users/${currentUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordData.newPassword })
      });
      const json = await res.json();
      if (json.success) {
        alert('密码修改成功，请重新登录');
        localStorage.removeItem('user');
        router.push('/login');
      } else {
        alert(json.error || '修改失败');
      }
    } catch (e) {
      alert('修改失败');
    }
  };

  if (!county) return <div>缺少权限信息 (County missing)</div>;
  if (loading) return <div>加载中...</div>;

  return (
    <div className="container mx-auto p-4 max-w-4xl">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">{county} - 请选择任务批次</h1>
            <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                    欢迎您，<span className="font-semibold text-foreground">{currentUser?.username || 'User'}</span>
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowChangePasswordModal(true)}
                >
                    修改密码
                </Button>
                <Button variant="outline" onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    localStorage.removeItem('user');
                    router.push('/login');
                }}>退出登录</Button>
            </div>
        </div>

        <div className="grid gap-4">
            {batches.map(batch => {
                // Get stats for this county
                const stats = batch.stats?.[county] || { total: 0, submitted: 0 };
                const progress = stats.total ? Math.round((stats.submitted / stats.total) * 100) : 0;

                return (
                    <Link key={batch.id} href={`/tasks?county=${encodeURIComponent(county)}&batchId=${batch.id}`}>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-lg font-medium">{batch.name}</CardTitle>
                                <div className="text-sm text-muted-foreground">
                                    {new Date(batch.createdAt).toLocaleDateString()}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span>完成进度</span>
                                        <span>{progress}% ({stats.submitted}/{stats.total})</span>
                                    </div>
                                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-500"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                );
            })}

            {batches.length === 0 && (
                <div className="text-center text-muted-foreground py-10">
                    暂无任务批次
                </div>
            )}

            {/* Change Password Modal */}
            {showChangePasswordModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-sm">
                        <CardHeader>
                            <CardTitle>修改密码</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium">新密码</label>
                                <input
                                    type="password"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                                    value={passwordData.newPassword}
                                    onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">确认新密码</label>
                                <input
                                    type="password"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                                    value={passwordData.confirmPassword}
                                    onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setShowChangePasswordModal(false)}>取消</Button>
                                <Button onClick={handleChangePassword}>确认修改</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    </div>
  );
}
