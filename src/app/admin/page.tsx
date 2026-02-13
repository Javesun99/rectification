'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Upload, FileSpreadsheet, Save, Trash2, Plus, RefreshCw } from 'lucide-react';
import ImportConfig from '@/components/ImportConfig';
import FormattedDate from '@/components/FormattedDate';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'import' | 'manage' | 'users' | 'logs'>('import');

  // Import State
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [batchName, setBatchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showImportConfig, setShowImportConfig] = useState(false);

  // Append Task State
  const [isAppendMode, setIsAppendMode] = useState(false);
  const [targetBatchId, setTargetBatchId] = useState<string>('');
  const [uniqueKey, setUniqueKey] = useState<string>('');

  // Manage State
  const [tasks, setTasks] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [newTaskData, setNewTaskData] = useState<Record<string, any>>({});

  // User Management State
  const [users, setUsers] = useState<any[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    // Fetch current user from server (cookie-based)
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Unauthorized');
      })
      .then(data => {
        if (data.user) {
            setCurrentUser(data.user);
            setCurrentUserRole(data.user.role || '');
        }
      })
      .catch(() => {
        // Auth handled by middleware, ignore client-side redirect
        console.log('Failed to fetch user info');
      });
  }, []);

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserData, setNewUserData] = useState({ username: '', password: '', role: 'user', county: '' });

  // Password Management State
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [resetPasswordId, setResetPasswordId] = useState<number | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  // New state for viewing specific batch details
  const [viewingBatchId, setViewingBatchId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);

  // Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'batch' | 'task' | 'user'; id: number } | null>(null);

  // Rejection State
  const [rejectTaskId, setRejectTaskId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Task Edit State
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState<Record<string, any>>({});

  const handleUpdateTask = async () => {
    if (!selectedTask) return;

    try {
      const res = await fetch(`/api/admin/tasks/${selectedTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_json: JSON.stringify(editingSubmission)
        })
      });
      const json = await res.json();
      if (json.success) {
        alert('任务内容更新成功');
        setIsEditingTask(false);
        // Update local state
        const updatedTask = { ...selectedTask, submission_json: JSON.stringify(editingSubmission) };
        setSelectedTask(updatedTask);
        // Update list state
        setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
      } else {
        alert(json.error || '更新失败');
      }
    } catch (e) {
      alert('更新失败');
    }
  };

  // Export State
  const [exportBatchId, setExportBatchId] = useState<string>('');
  const [exportLoading, setExportLoading] = useState(false);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // Status Filter State
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'submitted' | 'rejected'>('all');

  // Date Filter State
  const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({ start: '', end: '' });

  const router = useRouter();

  // Logs State
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    // Check admin auth handled by middleware and fetch above
    if (activeTab === 'manage' || activeTab === 'import') {
      fetchBatches();
    }
  }, [activeTab]);

  // Auto-fill mapping in Append Mode
  useEffect(() => {
    if (isAppendMode && targetBatchId) {
      const targetBatch = batches.find(b => String(b.id) === targetBatchId);
      if (targetBatch && targetBatch.config_json) {
        try {
          const config = JSON.parse(targetBatch.config_json);
          setMapping(config);
        } catch (e) {
          console.error('Failed to parse target batch config', e);
        }
      }
    }
  }, [isAppendMode, targetBatchId, batches, headers]);

  const fetchLogs = async () => {
    if (currentUserRole !== 'superadmin') return;
    try {
      const res = await fetch('/api/admin/logs');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch logs', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs' && currentUserRole === 'superadmin') {
      fetchLogs();
    }
  }, [activeTab, currentUserRole]);

  const handleExport = async (batchId?: string) => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      // If batchId is provided (clicked from card), use it. Otherwise use the dropdown state.
      const targetId = typeof batchId === 'string' ? batchId : exportBatchId;

      if (targetId) params.append('batchId', targetId);

      const response = await fetch(`/api/export?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = targetId
        ? `tasks_export_${batches.find(b => String(b.id) === targetId)?.name || targetId}.xlsx`
        : 'tasks_export_all.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      alert('导出失败');
    } finally {
      setExportLoading(false);
    }
  };

  const handleRejectTask = async () => {
    if (!rejectionReason) return alert('请输入驳回原因');
    if (!rejectTaskId) return;

    try {
      const res = await fetch(`/api/admin/tasks/${rejectTaskId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason, operator: currentUser?.username })
      });
      const json = await res.json();
      if (json.success) {
        alert('任务已驳回');
        setRejectTaskId(null);
        setRejectionReason('');
        setSelectedTask(null); // Close detail modal
        // Refresh list
        if (viewingBatchId) fetchTasks(viewingBatchId);
      } else {
        alert(json.error || '操作失败');
      }
    } catch (e) {
      alert('操作失败');
    }
  };

  const fetchUsers = async () => {
    if (currentUserRole !== 'superadmin' && currentUserRole !== 'admin') return;

    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to fetch users', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'users' && (currentUserRole === 'superadmin' || currentUserRole === 'admin')) {
      fetchUsers();
    }
  }, [activeTab, currentUserRole]);

  const handleCreateUser = async () => {
    if (!newUserData.username || !newUserData.password) return alert('用户名和密码必填');
    if (newUserData.role === 'user' && !newUserData.county) {
      if (!window.confirm('普通用户未绑定县市，可能无法查看任何任务。确定创建吗？')) return;
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserData)
      });
      const json = await res.json();
      if (json.user) {
        alert('用户创建成功');
        setShowAddUserModal(false);
        setNewUserData({ username: '', password: '', role: 'user', county: '' });
        fetchUsers();
      } else {
        alert(json.error || '创建失败');
      }
    } catch (e) {
      alert('创建失败');
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.oldPassword) return alert('请输入原密码');
    if (!passwordData.newPassword || !passwordData.confirmPassword) return alert('请输入新密码');
    if (passwordData.newPassword !== passwordData.confirmPassword) return alert('两次输入新密码不一致');

    try {
      const res = await fetch(`/api/admin/users/${currentUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: passwordData.newPassword,
          oldPassword: passwordData.oldPassword
        })
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

  const handleResetPassword = async () => {
    if (!resetPasswordValue) return alert('请输入新密码');

    try {
      const res = await fetch(`/api/admin/users/${resetPasswordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPasswordValue })
      });
      const json = await res.json();
      if (json.success) {
        alert('密码重置成功');
        setResetPasswordId(null);
        setResetPasswordValue('');
      } else {
        alert(json.error || '重置失败');
      }
    } catch (e) {
      alert('重置失败');
    }
  };

  const handleDeleteUser = (id: number) => {
    setDeleteConfirm({ type: 'user', id });
  };

  const fetchTasks = async (batchId?: number | React.MouseEvent, overrideDateFilter?: { start: string, end: string }) => {
    const id = typeof batchId === 'number' ? batchId : viewingBatchId;
    if (!id) return;

    const params = new URLSearchParams();
    params.append('batchId', String(id));

    // Use override if provided, otherwise use state
    const currentStart = overrideDateFilter ? overrideDateFilter.start : dateFilter.start;
    const currentEnd = overrideDateFilter ? overrideDateFilter.end : dateFilter.end;

    if (currentStart) params.append('startDate', currentStart);
    if (currentEnd) params.append('endDate', currentEnd);

    const url = `/api/admin/tasks?${params.toString()}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.tasks) setTasks(json.tasks);
  };

  const fetchBatches = async () => {
    const res = await fetch('/api/admin/batches');
    const json = await res.json();
    if (json.batches) setBatches(json.batches);
  };

  const handleDeleteBatch = (id: number) => {
    setDeleteConfirm({ type: 'batch', id });
  };

  const handleDeleteTask = (id: number) => {
    setDeleteConfirm({ type: 'task', id });
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;

    try {
      if (type === 'batch') {
        await fetch(`/api/admin/batches/${id}`, { method: 'DELETE' });
        if (viewingBatchId === id) setViewingBatchId(null);
        fetchBatches();
      } else if (type === 'task') {
        await fetch(`/api/admin/tasks/${id}`, { method: 'DELETE' });
        setTasks(prev => prev.filter(t => t.id !== id));
      } else if (type === 'user') {
        const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        if (res.ok) {
            setUsers(prev => prev.filter(u => u.id !== id));
        } else {
            const json = await res.json();
            alert(json.error || '删除失败');
        }
      }
    } catch (e) {
      alert('删除失败');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleCreateTask = async () => {
    if (!selectedBatchId) return alert('请选择任务批次');

    const batch = batches.find(b => String(b.id) === selectedBatchId);
    if (batch) {
      const config = JSON.parse(batch.config_json);
      // Validate required fields (optional enhancement: you can define which fields are strictly required)
      // For now, we allow empty fields unless specific logic is needed.
      // If user wants to enforce "County" is present:
      const countyKey = Object.keys(config).find(key => String(config[key]).startsWith('county'));
      if (countyKey && !newTaskData[countyKey]) {
        if (!window.confirm(`"${countyKey}" (权限字段) 为空，确定要创建吗？这可能导致该任务无法被正确分配。`)) {
          return;
        }
      }
    }

    try {
      const res = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: selectedBatchId, data: newTaskData })
      });
      const json = await res.json();
      if (json.task) {
        alert('任务创建成功');
        setShowAddModal(false);
        setNewTaskData({});
        // If currently viewing this batch, refresh tasks
        if (viewingBatchId === Number(selectedBatchId)) {
          fetchTasks(viewingBatchId);
        }
        // Always refresh batches to update counts
        fetchBatches();
      } else {
        alert(json.error || '创建失败');
      }
    } catch (e) {
      alert('创建失败');
    }
  };

  // ... (Existing Excel Import Logic replaced by ImportConfig)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setBatchName(f.name.replace(/\.[^/.]+$/, ""));
    setShowImportConfig(true);
    // Reset previous parse results
    setHeaders([]);
    setData([]);
  };

  const handleParsedData = (parsedHeaders: string[], parsedData: any[]) => {
    setHeaders(parsedHeaders);
    setData(parsedData);
    setMapping({});
    setShowImportConfig(false);
  };

  const handleImport = async () => {
    if (!isAppendMode && !batchName) return alert('Please enter a batch name');
    if (isAppendMode && !targetBatchId) return alert('请选择要追加的任务批次');
    if (isAppendMode && !uniqueKey) return alert('请选择用于去重的唯一列');

    if (isAppendMode && targetBatchId) {
        const targetBatch = batches.find(b => String(b.id) === targetBatchId);
        const config = targetBatch ? JSON.parse(targetBatch.config_json) : {};
        const configKeys = Object.keys(config);

        // Use mapping logic from import routine to handle potential duplicates or empty headers
        // Simulating the header processing done in loadSheetData
        const processedHeaders = headers; // Headers are already processed in loadSheetData

        // Check if all config keys exist in the current headers
        const missingHeaders = configKeys.filter(k => !processedHeaders.includes(k));

        if (missingHeaders.length > 0) {
            // Check if missing headers are actually optional or system fields?
            // Current requirement is strict match.
            // However, sometimes ExcelJS might trim headers or handle them differently.
            // Let's trust the 'headers' state which comes from loadSheetData.
            return alert(`表头校验失败！\n上传的 Excel 缺少以下必要列：\n${missingHeaders.join(', ')}\n\n请确保 Excel 表头与原批次完全一致。`);
        }
    }

    if (!isAppendMode && batches.some(b => b.name === batchName)) {
        return alert('任务批次名称已存在，请使用其他名称');
    }

    // In append mode, we don't strictly require county mapping if we reuse existing config,
    // but here we are re-mapping or validating against existing config.
    // For simplicity, let's assume user must map 'county' again or we validate it matches target batch.
    if (!Object.values(mapping).some(v => v.startsWith('county'))) {
      return alert('请指定哪一列是“县市/权限范围” (County)');
    }

    setLoading(true);
    try {
      const payload: any = {
        mapping,
        data,
        isAppend: isAppendMode
      };

      if (isAppendMode) {
        payload.batchId = targetBatchId;
        payload.uniqueKey = uniqueKey;
      } else {
        payload.name = batchName;
      }

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.success) {
        alert(isAppendMode
          ? `追加成功！新增 ${result.count} 条任务 (已跳过 ${result.skipped} 条重复任务)。`
          : `导入成功！共 ${result.count} 条任务。`
        );
        setFile(null);
        setHeaders([]);
        setData([]);
        setMapping({});
        setBatchName('');
        setIsAppendMode(false);
        setTargetBatchId('');
        setUniqueKey('');
        fetchBatches();
      } else {
        alert('Error: ' + result.error);
      }
    } catch (e) {
      alert('Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-6xl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">管理员控制台</h1>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <Button
                variant={activeTab === 'import' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('import')}
                className="flex-1 md:flex-none"
            >
                批量导入
            </Button>
            <Button
                variant={activeTab === 'manage' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('manage')}
                className="flex-1 md:flex-none"
            >
                任务管理
            </Button>
            {(currentUserRole === 'superadmin' || currentUserRole === 'admin') && (
                <Button
                    variant={activeTab === 'users' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('users')}
                    className="flex-1 md:flex-none"
                >
                    用户管理
                </Button>
            )}
            {currentUserRole === 'superadmin' && (
                <Button
                    variant={activeTab === 'logs' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('logs')}
                    className="flex-1 md:flex-none"
                >
                    登录日志
                </Button>
            )}

            <div className="flex items-center gap-2 border-l pl-2 ml-2 md:pl-4 md:ml-2 w-full md:w-auto justify-end md:justify-start mt-2 md:mt-0">
                <span className="text-xs md:text-sm text-muted-foreground truncate max-w-[100px] md:max-w-none">
                    <span className="font-semibold text-foreground">{currentUser?.username || 'Admin'}</span>
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => setShowChangePasswordModal(true)}
                >
                    <span className="hidden sm:inline">修改密码</span>
                    <span className="sm:hidden">改密</span>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                    onClick={async () => {
                        await fetch('/api/auth/logout', { method: 'POST' });
                        localStorage.removeItem('user');
                        router.push('/login');
                    }}
                >
                    <span className="hidden sm:inline">退出登录</span>
                    <span className="sm:hidden">退出</span>
                </Button>
            </div>
        </div>
      </div>

      {/* Change Password Modal - Moved outside of conditional tabs to be always accessible */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>修改密码</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">原密码</label>
                <input
                  type="password"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                  value={passwordData.oldPassword}
                  onChange={e => setPasswordData({...passwordData, oldPassword: e.target.value})}
                />
              </div>
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

      {/* Reset Password Modal - Global */}
      {resetPasswordId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle>重置密码</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">新密码</label>
                        <input
                            type="password"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                            value={resetPasswordValue}
                            onChange={e => setResetPasswordValue(e.target.value)}
                            placeholder="请输入新密码"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => {
                            setResetPasswordId(null);
                            setResetPasswordValue('');
                        }}>取消</Button>
                        <Button onClick={handleResetPassword}>确认重置</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
      )}

      {/* Delete Confirmation Modal - Global */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle>确认删除</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="mb-6 text-sm text-muted-foreground">
                        {deleteConfirm.type === 'batch'
                            ? '确定要删除该批次吗？这将永久删除该批次下的所有任务且无法恢复。'
                            : deleteConfirm.type === 'user'
                                ? '确定要删除该用户吗？此操作不可逆。'
                                : '确定要删除该任务吗？此操作无法撤销。'}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>取消</Button>
                        <Button variant="destructive" onClick={executeDelete}>确认删除</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">用户列表</h2>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={fetchUsers}><RefreshCw className="w-4 h-4"/></Button>
                    <Button onClick={() => setShowAddUserModal(true)}><Plus className="w-4 h-4 mr-2"/> 新增用户</Button>
                </div>
            </div>

            {showAddUserModal && (
                <Card className="border-2 border-primary mb-6">
                    <CardHeader>
                        <CardTitle>新增用户</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium">用户名</label>
                                <input
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                                    value={newUserData.username}
                                    onChange={e => setNewUserData({...newUserData, username: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">密码</label>
                                <input
                                    type="password"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                                    value={newUserData.password}
                                    onChange={e => setNewUserData({...newUserData, password: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">角色</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                                    value={newUserData.role}
                                    onChange={e => setNewUserData({...newUserData, role: e.target.value})}
                                    disabled={currentUserRole === 'admin'}
                                >
                                    <option value="user">普通用户 (User)</option>
                                    {currentUserRole === 'superadmin' && (
                                        <>
                                            <option value="admin">管理员 (Admin)</option>
                                            <option value="superadmin">超级管理员 (Super Admin)</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            {newUserData.role === 'user' && (
                                <div>
                                    <label className="text-sm font-medium">绑定县市 (County)</label>
                                    <input
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                                        placeholder="例如: 北京"
                                        value={newUserData.county}
                                        onChange={e => setNewUserData({...newUserData, county: e.target.value})}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setShowAddUserModal(false)}>取消</Button>
                            <Button onClick={handleCreateUser}>创建用户</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="p-4 text-left font-medium">ID</th>
                            <th className="p-4 text-left font-medium">用户名</th>
                            <th className="p-4 text-left font-medium">角色</th>
                            <th className="p-4 text-left font-medium">绑定县市</th>
                            <th className="p-4 text-left font-medium">创建时间</th>
                            <th className="p-4 text-left font-medium">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className="border-b">
                                <td className="p-4">{user.id}</td>
                                <td className="p-4 font-medium">{user.username}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        user.role === 'superadmin' ? 'bg-red-100 text-red-800' :
                                        user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                        'bg-blue-100 text-blue-800'
                                    }`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="p-4">{user.county || '-'}</td>
                                <td className="p-4"><FormattedDate date={user.createdAt} mode="date" /></td>
                                <td className="p-4">
                                    {(currentUserRole === 'superadmin' || (currentUserRole === 'admin' && user.role === 'user')) && (
                                        <>
                                            <Button variant="outline" size="sm" className="mr-2" onClick={() => setResetPasswordId(user.id)}>
                                                重置密码
                                            </Button>
                                            <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">登录日志 (最近100条)</h2>
                <Button variant="outline" size="icon" onClick={fetchLogs}><RefreshCw className="w-4 h-4"/></Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="p-4 text-left font-medium">用户</th>
                            <th className="p-4 text-left font-medium">角色</th>
                            <th className="p-4 text-left font-medium">县市</th>
                            <th className="p-4 text-left font-medium">IP地址</th>
                            <th className="p-4 text-left font-medium">设备信息</th>
                            <th className="p-4 text-left font-medium">登录时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log: any) => (
                            <tr key={log.id} className="border-b hover:bg-muted/20">
                                <td className="p-4 font-medium">{log.user?.username || '未知'}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        log.user?.role === 'superadmin' ? 'bg-red-100 text-red-800' :
                                        log.user?.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                        'bg-blue-100 text-blue-800'
                                    }`}>
                                        {log.user?.role || '-'}
                                    </span>
                                </td>
                                <td className="p-4">{log.user?.county || '-'}</td>
                                <td className="p-4 font-mono text-xs">{log.ip}</td>
                                <td className="p-4 text-xs text-muted-foreground max-w-[200px] truncate" title={log.userAgent}>
                                    {log.userAgent}
                                </td>
                                <td className="p-4"><FormattedDate date={log.loginAt} /></td>
                            </tr>
                        ))}
                        {logs.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-muted-foreground">暂无登录记录</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {activeTab === 'import' && (
        <Card className="mb-8">
            {/* Existing Import UI */}
            <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                上传 Excel 任务表
            </CardTitle>
            </CardHeader>
            <CardContent>
            <div className="grid w-full max-w-sm items-center gap-1.5 mb-4">
                <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
            </div>

            {/* Import Config Wizard */}
            {showImportConfig && file && (
                <ImportConfig
                    file={file}
                    onParsed={handleParsedData}
                    onCancel={() => {
                        setFile(null);
                        setShowImportConfig(false);
                    }}
                />
            )}

            {headers.length > 0 && !showImportConfig && (
                <div className="space-y-4">

                {/* Mode Selection */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-muted/20 p-3 rounded-md">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="importMode"
                            checked={!isAppendMode}
                            onChange={() => setIsAppendMode(false)}
                            className="text-primary focus:ring-primary"
                        />
                        <span className="font-medium">新建批次</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="importMode"
                            checked={isAppendMode}
                            onChange={() => setIsAppendMode(true)}
                            className="text-primary focus:ring-primary"
                        />
                        <span className="font-medium">追加到现有批次</span>
                    </label>
                </div>

                {!isAppendMode ? (
                    <div>
                        <label className="text-sm font-medium">任务批次名称</label>
                        <input
                        value={batchName}
                        onChange={e => setBatchName(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                        placeholder="例如: 2024年第一季度整改"
                        />
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium">选择目标批次</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                                value={targetBatchId}
                                onChange={e => setTargetBatchId(e.target.value)}
                            >
                                <option value="">请选择...</option>
                                {batches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name} (ID: {b.id})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">选择去重唯一列 (Unique Key)</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                                value={uniqueKey}
                                onChange={e => setUniqueKey(e.target.value)}
                            >
                                <option value="">请选择...</option>
                                {headers.map(h => (
                                    <option key={h} value={h}>{h}</option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground mt-1">
                                系统将根据此列的值自动剔除目标批次中已存在的任务。
                            </p>
                        </div>
                    </div>
                )}

                <div className="border rounded-md p-4 bg-muted/20">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    列属性映射
                    </h3>
                    {isAppendMode && targetBatchId ? (
                        (() => {
                            const targetBatch = batches.find(b => String(b.id) === targetBatchId);
                            const config = targetBatch ? JSON.parse(targetBatch.config_json) : {};
                            const configKeys = Object.keys(config);
                            const missingHeaders = configKeys.filter(k => !headers.includes(k));

                            return (
                                <div className="space-y-4">
                                    <div className="text-sm text-muted-foreground">
                                        <p>追加模式下，列属性映射将自动与目标批次保持一致。</p>
                                    </div>

                                    {missingHeaders.length > 0 ? (
                                        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                                            <strong>警告：</strong> 上传的 Excel 表头缺少目标批次所需的列：
                                            <ul className="list-disc list-inside mt-1">
                                                {missingHeaders.map(h => <li key={h}>{h}</li>)}
                                            </ul>
                                            <p className="mt-2">请调整 Excel 文件或选择正确的批次，否则导入可能失败或数据缺失。</p>
                                        </div>
                                    ) : (
                                        <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded text-sm flex items-center gap-2">
                                            <span className="text-xl">✓</span>
                                            表头校验通过，已自动应用映射配置。
                                        </div>
                                    )}
                                </div>
                            );
                        })()
                    ) : (
                        <div className="grid gap-4">
                        {headers.map(header => (
                            <div key={header} className="grid grid-cols-2 items-center gap-4">
                            <span className="text-sm font-medium truncate" title={header}>{header}</span>
                            <select
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={mapping[header] ? mapping[header].split('|')[0] : ''}
                                onChange={(e) => {
                                    const newType = e.target.value;
                                    const current = mapping[header] || '';
                                    const isRequired = current.includes('|required');
                                    setMapping(prev => ({
                                        ...prev,
                                        [header]: newType + (isRequired && ['text', 'image', 'date'].includes(newType) ? '|required' : '')
                                    }));
                                }}
                            >
                                <option value="">(忽略/仅展示)</option>
                                <option value="fixed">固定展示信息 (Fixed Display)</option>
                                <option value="county">县市/权限范围 (County)</option>
                                <option value="text">文字输入 (Text Input)</option>
                                <option value="image">图片上传 (Image Upload)</option>
                                <option value="date">日期选择 (Date Input)</option>
                                <option value="prefill">预填信息 (Pre-filled Info)</option>
                            </select>

                            {/* Required Checkbox */}
                            {['text', 'image', 'date'].includes(mapping[header]?.split('|')[0]) && (
                                <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-primary focus:ring-primary"
                                        checked={mapping[header]?.includes('|required')}
                                        onChange={(e) => {
                                            const baseType = mapping[header].split('|')[0];
                                            if (e.target.checked) {
                                                setMapping(prev => ({ ...prev, [header]: baseType + '|required' }));
                                            } else {
                                                setMapping(prev => ({ ...prev, [header]: baseType }));
                                            }
                                        }}
                                    />
                                    <span className="text-red-500 font-medium">必填</span>
                                </label>
                            )}
                            </div>
                        ))}
                        </div>
                    )}
                </div>

                <Button onClick={handleImport} disabled={loading} className="w-full">
                    {loading ? '导入中...' : '确认导入并生成任务'}
                    {!loading && <Save className="ml-2 w-4 h-4" />}
                </Button>
                </div>
            )}

            <div className="mt-8 border-t pt-8">
                <h3 className="font-semibold mb-4">数据导出</h3>
                <div className="flex gap-4">
                    <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={exportBatchId}
                        onChange={(e) => setExportBatchId(e.target.value)}
                    >
                        <option value="">所有批次 (All Batches)</option>
                        {batches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <Button onClick={() => handleExport()} disabled={exportLoading} variant="outline" className="w-full">
                        {exportLoading ? '导出中...' : '导出任务数据 (Excel)'}
                    </Button>
                </div>
            </div>
            </CardContent>
        </Card>
      )}

      {activeTab === 'manage' && (
        <div className="space-y-6">
            {/* Batch List */}
            {!viewingBatchId && (
                <div className="grid gap-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold">任务批次概览</h2>
                        <Button onClick={() => setShowAddModal(true)}><Plus className="w-4 h-4 mr-2"/> 新增任务</Button>
                    </div>

                    <div className="grid gap-4">
                        {batches.map(batch => (
                            <Card key={batch.id} className="hover:shadow-md transition-shadow relative group">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-lg font-medium">{batch.name}</CardTitle>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={() => {
                                            setViewingBatchId(batch.id);
                                            fetchTasks(batch.id);
                                        }}>
                                            查看详情 &gt;
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteBatch(batch.id);
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleExport(String(batch.id));
                                            }}
                                        >
                                            导出
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-sm text-muted-foreground mb-4 flex flex-col gap-1">
                                        <div>发布人: <span className="font-medium text-foreground">{batch.creatorName}</span></div>
                                        <div className="flex items-center gap-1">
                                            导入时间: <FormattedDate date={batch.createdAt} /> | 总任务数: {batch.totalTasks}
                                        </div>
                                    </div>

                                    {batch.stats && Object.keys(batch.stats).length > 0 ? (
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {Object.entries(batch.stats).map(([county, stats]: [string, any]) => {
                                                const percent = Math.round((stats.submitted / stats.total) * 100);
                                                return (
                                                    <div key={county} className="bg-muted/30 p-3 rounded-md">
                                                        <div className="font-medium mb-1">{county}</div>
                                                        <div className="flex justify-between text-xs mb-1">
                                                            <span>{stats.submitted}/{stats.total}</span>
                                                            <span className={percent === 100 ? 'text-green-600 font-bold' : ''}>{percent}%</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                                            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-muted-foreground italic">暂无统计数据</div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                        {batches.length === 0 && <div className="text-center py-8 text-muted-foreground">暂无任务批次，请先导入数据。</div>}
                    </div>
                </div>
            )}

            {/* Task List (Specific Batch) */}
            {viewingBatchId && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" onClick={() => {
                                setViewingBatchId(null);
                                setSearchTerm('');
                                setStatusFilter('all');
                                setDateFilter({ start: '', end: '' });
                            }}>← 返回批次列表</Button>
                            <h2 className="text-xl font-semibold">
                                {batches.find(b => b.id === viewingBatchId)?.name} - 任务清单
                            </h2>
                        </div>
                        <input
                            type="text"
                            placeholder="搜索任务/县市..."
                            className="flex h-9 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Filter Controls Bar */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-4 p-3 bg-muted/20 rounded-md items-start sm:items-center justify-between">
                        {/* Status Filter */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">状态筛选:</span>
                            <div className="flex bg-background rounded-md border p-1">
                                {(['all', 'pending', 'submitted', 'rejected'] as const).map(status => (
                                    <button
                                        key={status}
                                        onClick={() => setStatusFilter(status)}
                                        className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${
                                            statusFilter === status
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                        }`}
                                    >
                                        {status === 'all' ? '全部' :
                                         status === 'pending' ? '待处理' :
                                         status === 'submitted' ? '已提交' : '已退回'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Date Filter */}
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">提交时间:</span>
                            <div className="flex items-center gap-2 flex-1 sm:flex-none">
                                <input
                                    type="date"
                                    className="flex h-8 w-full sm:w-32 rounded-md border border-input bg-background px-2 text-xs"
                                    value={dateFilter.start}
                                    onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                                />
                                <span className="text-sm text-muted-foreground">-</span>
                                <input
                                    type="date"
                                    className="flex h-8 w-full sm:w-32 rounded-md border border-input bg-background px-2 text-xs"
                                    value={dateFilter.end}
                                    onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                                />
                            </div>
                            <div className="flex gap-1 ml-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 px-3"
                                    onClick={() => viewingBatchId && fetchTasks(viewingBatchId)}
                                >
                                    筛选
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-3"
                                    onClick={() => {
                                        const emptyDate = { start: '', end: '' };
                                        setDateFilter(emptyDate);
                                        // Refresh tasks with cleared dates immediately
                                        if (viewingBatchId) fetchTasks(viewingBatchId, emptyDate);
                                    }}
                                >
                                    重置日期
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-md border overflow-x-auto">
                        <table className="w-full text-sm min-w-[800px]">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="p-4 text-left font-medium">ID</th>
                                    <th className="p-4 text-left font-medium">县市</th>
                                    <th className="p-4 text-left font-medium">状态</th>
                                    <th className="p-4 text-left font-medium">摘要</th>
                                    <th className="p-4 text-left font-medium">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tasks.filter(task => {
                                    // Status Filter
                                    if (statusFilter !== 'all' && task.status !== statusFilter) return false;

                                    if (!searchTerm) return true;
                                    try {
                                        const ref = JSON.parse(task.reference_json || '{}');
                                        const searchString = [
                                            String(task.id),
                                            task.county,
                                            task.status,
                                            Object.values(ref).join(' ')
                                        ].join(' ').toLowerCase();
                                        return searchString.includes(searchTerm.toLowerCase());
                                    } catch (e) {
                                        // Fallback search if JSON parse fails
                                        const searchString = [
                                            String(task.id),
                                            task.county,
                                            task.status
                                        ].join(' ').toLowerCase();
                                        return searchString.includes(searchTerm.toLowerCase());
                                    }
                                }).map(task => {
                                    let summary = '';
                                    try {
                                        const ref = JSON.parse(task.reference_json || '{}');
                                        const currentBatch = batches.find(b => b.id === viewingBatchId);
                                        const config = currentBatch ? JSON.parse(currentBatch.config_json || '{}') : {};
                                        const fixedKeys = Object.keys(config).filter(k => config[k] === 'fixed' || config[k].startsWith('fixed'));
                                        if (fixedKeys.length > 0) {
                                            summary = fixedKeys.slice(0, 2).map(k => ref[k]).filter(Boolean).join(', ');
                                        } else {
                                            summary = Object.values(ref).slice(0, 2).join(', ');
                                        }
                                    } catch (e) {
                                        summary = '数据解析错误';
                                    }
                                    return (
                                        <tr key={task.id} className="border-b">
                                            <td className="p-4">{task.id}</td>
                                            <td className="p-4">{task.county}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs ${
                                                    task.status === 'submitted' ? 'bg-green-100 text-green-800' :
                                                    task.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                    {task.status === 'submitted' ? '已提交' : task.status === 'rejected' ? '已退回' : '待处理'}
                                                </span>
                                                {task.submittedAt && (
                                                    <div className="text-[10px] text-muted-foreground mt-1">
                                                        <FormattedDate date={task.submittedAt} mode="date" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 max-w-xs truncate cursor-pointer hover:bg-muted/50 transition-colors" title={summary} onClick={() => setSelectedTask(task)}>
                                                {summary}
                                            </td>
                                            <td className="p-4">
                                                <Button variant="outline" size="sm" className="mr-2" onClick={() => setSelectedTask(task)}>
                                                    查看
                                                </Button>
                                                <Button variant="destructive" size="sm" onClick={() => handleDeleteTask(task.id)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {tasks.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted-foreground">该批次下暂无任务</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Add Task Modal / Form */}
            {showAddModal && (
                <Card className="border-2 border-primary">
                    <CardHeader>
                        <CardTitle>新增任务</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium">选择批次 (模板)</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                                value={selectedBatchId}
                                onChange={e => {
                                    setSelectedBatchId(e.target.value);
                                    setNewTaskData({});
                                }}
                            >
                                <option value="">请选择...</option>
                                {batches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name} (ID: {b.id})</option>
                                ))}
                            </select>
                        </div>

                        {selectedBatchId && (() => {
                            const batch = batches.find(b => String(b.id) === selectedBatchId);
                            if (!batch) return null;
                            const config = JSON.parse(batch.config_json);
                            return (
                                <div className="space-y-4 border p-4 rounded-md">
                                    {Object.keys(config).map(key => {
                                        const typeStr = String(config[key]);
                                        const isCounty = typeStr.startsWith('county');
                                        const baseType = typeStr.split('|')[0];
                                        return (
                                            <div key={key}>
                                                <label className="text-sm font-medium flex items-center gap-1">
                                                    {key} ({baseType})
                                                    {isCounty && <span className="text-red-500 text-xs">* (权限必填)</span>}
                                                </label>
                                                <input
                                                    className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm mt-1 ${isCounty ? 'border-primary/50 bg-primary/5' : 'border-input'}`}
                                                    value={newTaskData[key] || ''}
                                                    onChange={e => setNewTaskData(prev => ({ ...prev, [key]: e.target.value }))}
                                                    placeholder={isCounty ? '此字段决定任务归属，建议必填' : ''}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}

                        <div className="flex gap-2">
                            <Button onClick={handleCreateTask}>确认创建</Button>
                            <Button variant="ghost" onClick={() => setShowAddModal(false)}>取消</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Task Detail Modal */}
            {selectedTask && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>任务详情 #{selectedTask.id}</CardTitle>
                            <div className="flex gap-2">
                                {(currentUserRole === 'admin' || currentUserRole === 'superadmin') && !isEditingTask && selectedTask.submission_json && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            try {
                                                setEditingSubmission(JSON.parse(selectedTask.submission_json));
                                                setIsEditingTask(true);
                                            } catch(e) {
                                                alert('无法解析提交数据，无法编辑');
                                            }
                                        }}
                                    >
                                        编辑内容
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => {
                                    setSelectedTask(null);
                                    setIsEditingTask(false);
                                }}>
                                    X
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                <div>
                                    <h3 className="font-semibold mb-2">原始信息 (Reference)</h3>
                                    <div className="bg-muted p-3 rounded-md text-sm space-y-1">
                                        {selectedTask.reference_json && (() => {
                                            try {
                                                const ref = JSON.parse(selectedTask.reference_json);
                                                return Object.entries(ref).map(([k, v]) => (
                                                    <div key={k} className="grid grid-cols-3 gap-2">
                                                        <span className="font-medium text-muted-foreground">{k}:</span>
                                                        <span className="col-span-2 break-all">{String(v)}</span>
                                                    </div>
                                                ));
                                            } catch (e) {
                                                return <div className="text-red-500">数据解析错误</div>;
                                            }
                                        })()}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="font-semibold mb-2">提交信息 (Submission)</h3>
                                    {isEditingTask ? (
                                        <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-md text-sm space-y-4">
                                            {Object.keys(editingSubmission).map(k => {
                                                const v = editingSubmission[k];
                                                const isImage = String(v).startsWith('data:image') || String(v).startsWith('http');
                                                return (
                                                    <div key={k}>
                                                        <div className="font-medium text-blue-800 mb-1">{k}:</div>
                                                        {isImage ? (
                                                            <div className="space-y-2">
                                                                <img src={String(v)} alt={k} className="max-h-40 rounded-md border" />
                                                                <input
                                                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                                                                    value={String(v)}
                                                                    onChange={e => setEditingSubmission(prev => ({...prev, [k]: e.target.value}))}
                                                                    placeholder="图片链接..."
                                                                />
                                                                <p className="text-xs text-muted-foreground">修改图片链接或Base64字符串</p>
                                                            </div>
                                                        ) : (
                                                            <textarea
                                                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                                value={String(v)}
                                                                onChange={e => setEditingSubmission(prev => ({...prev, [k]: e.target.value}))}
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            <div className="flex justify-end gap-2 pt-2">
                                                <Button variant="ghost" onClick={() => setIsEditingTask(false)}>取消</Button>
                                                <Button onClick={handleUpdateTask}>保存修改</Button>
                                            </div>
                                        </div>
                                    ) : selectedTask.submission_json ? (
                                        <div className="bg-green-50/50 border border-green-100 p-3 rounded-md text-sm space-y-4">
                                            {(() => {
                                                try {
                                                    const sub = JSON.parse(selectedTask.submission_json);
                                                    return Object.entries(sub).map(([k, v]) => {
                                                        const isImage = String(v).startsWith('data:image') || String(v).startsWith('http');
                                                        return (
                                                            <div key={k}>
                                                                <div className="font-medium text-green-800 mb-1">{k}:</div>
                                                                {isImage ? (
                                                                    <img src={String(v)} alt={k} className="max-w-full rounded-md border" />
                                                                ) : (
                                                                    <div className="break-all">{String(v)}</div>
                                                                )}
                                                            </div>
                                                        );
                                                    });
                                                } catch (e) {
                                                    return <div className="text-red-500">提交数据解析错误</div>;
                                                }
                                            })()}

                                            {/* Reject Button */}
                                            {selectedTask.status === 'submitted' && (
                                                <div className="pt-4 border-t border-green-200 mt-4">
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => setRejectTaskId(selectedTask.id)}
                                                    >
                                                        驳回任务 (需重填)
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-muted-foreground italic">暂无提交信息 (待处理)</div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Rejection Modal */}
            {rejectTaskId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle className="text-red-600">驳回任务 #{rejectTaskId}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">请输入驳回原因 (用户可见)</label>
                                <textarea
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
                                    value={rejectionReason}
                                    onChange={e => setRejectionReason(e.target.value)}
                                    placeholder="例如：图片不清晰，请重新拍摄..."
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => {
                                    setRejectTaskId(null);
                                    setRejectionReason('');
                                }}>取消</Button>
                                <Button variant="destructive" onClick={handleRejectTask}>确认驳回</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Delete Confirmation Modal - Moved to top level */}

            {/* Change Password Modal */}
            {/* Moved to top level to be accessible from any tab */}
            {/* {showChangePasswordModal && ( ... )} */}

            {/* Reset Password Modal - Moved to top level */}
        </div>
      )}
    </div>
  );
}
