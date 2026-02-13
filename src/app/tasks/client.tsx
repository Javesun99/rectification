'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ExcelJS from 'exceljs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function TasksContent() {
  const searchParams = useSearchParams();
  const county = searchParams.get('county');
  const batchId = searchParams.get('batchId');
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [fillLoading, setFillLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'submitted'>('all');
  const router = useRouter();

  useEffect(() => {
    if (county) {
      let url = `/api/tasks?county=${encodeURIComponent(county)}`;
      if (batchId) url += `&batchId=${batchId}`;

      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data.tasks) setTasks(data.tasks);
          setLoading(false);
        });
    }
  }, [county, batchId]);

  const handleExport = async () => {
    if (!county) return;
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('county', county);
      if (batchId) params.append('batchId', batchId);

      const response = await fetch(`/api/export?${params.toString()}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasks_export_${county}${batchId ? '_' + batchId : ''}.xlsx`;
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

  const handleBatchFill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !batchId) return;
    e.target.value = '';

    setFillLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];
      if (!ws) throw new Error('工作表为空');

      const headerRow = ws.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? '');
      });

      const rows: Record<string, any>[] = [];
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const obj: Record<string, any> = {};
        headers.forEach((h, i) => {
          const cell = row.getCell(i + 1);
          if (cell.value instanceof Date) {
            const d = cell.value;
            obj[h] = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
          } else {
            obj[h] = cell.value != null ? String(cell.value) : '';
          }
        });
        rows.push(obj);
      });

      if (rows.length === 0) {
        alert('Excel 中没有数据行');
        return;
      }

      const res = await fetch('/api/tasks/batch-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: Number(batchId), rows })
      });
      const json = await res.json();

      if (json.success) {
        let msg = `批量回填完成！成功更新 ${json.updated} 条任务`;
        if (json.skipped > 0) msg += `，跳过 ${json.skipped} 条`;
        if (json.errors && json.errors.length > 0) msg += `\n\n提示：\n${json.errors.join('\n')}`;
        alert(msg);
        window.location.reload();
      } else {
        alert(json.error || '回填失败');
      }
    } catch (err) {
      alert('文件解析失败，请确保上传的是有效的 Excel 文件');
    } finally {
      setFillLoading(false);
    }
  };

  if (!county) return <div>请先登录</div>;
  if (loading) return <div>加载中...</div>;

  const total = tasks.length;
  const completed = tasks.filter((t: any) => t.status === 'submitted').length;
  const progress = total ? Math.round((completed / total) * 100) : 0;

  // Get batch name if available (from first task)
  const batchName = tasks.length > 0 ? tasks[0].batch.name : '任务列表';

  const hasImageField = (() => {
    if (tasks.length === 0) return false;
    try {
      const cfg = JSON.parse(tasks[0].batch.config_json || '{}');
      return Object.values(cfg).some((v: any) => String(v).split('|')[0] === 'image');
    } catch { return false; }
  })();

  // Filter and Sort Tasks
  const filteredTasks = tasks.filter(task => {
    // 1. Status Filter
    if (filterStatus === 'pending' && task.status === 'submitted') return false;
    if (filterStatus === 'submitted' && task.status !== 'submitted') return false;

    // 2. Search Filter
    if (searchTerm) {
        try {
            const ref = JSON.parse(task.reference_json || '{}');
            const searchString = Object.values(ref).join(' ').toLowerCase();
            return searchString.includes(searchTerm.toLowerCase());
        } catch (e) {
            return false;
        }
    }
    return true;
  }).sort((a, b) => {
    // 3. Sort: Pending first, Submitted last
    const aIsCompleted = a.status === 'submitted';
    const bIsCompleted = b.status === 'submitted';
    if (aIsCompleted === bIsCompleted) return a.id - b.id; // Secondary sort by ID
    return aIsCompleted ? 1 : -1;
  });

  return (
    <div className="container mx-auto p-4 max-w-4xl">
        <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => router.back()}>
                        &lt; 返回
                    </Button>
                    <h1 className="text-xl font-bold truncate max-w-[200px] sm:max-w-md">{county} - {batchName}</h1>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleExport} disabled={exportLoading} size="sm">
                        {exportLoading ? '导出...' : '导出'}
                    </Button>
                    {batchId && !hasImageField && (
                        <label>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={fillLoading}
                                onClick={() => document.getElementById('batch-fill-input')?.click()}
                            >
                                {fillLoading ? '回填中...' : '上传回填'}
                            </Button>
                            <input
                                id="batch-fill-input"
                                type="file"
                                accept=".xlsx,.xls"
                                className="hidden"
                                onChange={handleBatchFill}
                            />
                        </label>
                    )}
                </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <input
                    type="text"
                    placeholder="搜索任务关键词..."
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="flex bg-muted p-1 rounded-md shrink-0">
                    {(['all', 'pending', 'submitted'] as const).map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${
                                filterStatus === status
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {status === 'all' ? '全部' : status === 'pending' ? '未完成' : '已完成'}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {/* Simplified Progress Bar (Full Width) */}
        <div className="mb-6">
            <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-muted-foreground">总体进度</span>
                <span className="font-bold">{progress}% ({completed}/{total})</span>
            </div>
            <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
                <div
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>

        <div className="grid gap-3">
            {filteredTasks.map((task: any) => {
                let ref: Record<string, any> = {};
                let config: Record<string, any> = {};
                try {
                    ref = JSON.parse(task.reference_json || '{}');
                    config = JSON.parse(task.batch.config_json || '{}');
                } catch (e) {
                    console.error('JSON Parse Error for task', task.id);
                }
                // Prioritize 'fixed' field for title, fallback to 'text'
                // User requirement: "优先展示 固定展示内容" as title if possible, or just prioritize fixed in display logic.
                // Assuming this means the main bold title should come from a fixed field if available.
                const titleKey = Object.keys(config).find(k => String(config[k]).startsWith('fixed')) ||
                                 Object.keys(config).find(k => String(config[k]).startsWith('text'));
                const title = titleKey ? ref[titleKey] : `任务 #${task.id}`;

                // Separate fixed info to display in body
                const fixedInfo = Object.entries(ref).filter(([k]) => {
                    const type = String(config[k]);
                    return type.startsWith('fixed') || type.startsWith('prefill');
                });
                const otherInfo = Object.entries(ref).filter(([k]) => {
                    const type = String(config[k]);
                    return !type.startsWith('fixed') && !type.startsWith('prefill') && k !== titleKey;
                });

                return (
                    <Card key={task.id} className={`overflow-hidden transition-all hover:shadow-md ${task.status === 'submitted' ? 'border-green-200 bg-green-50/30' : ''}`}>
                        <CardContent className="p-3 sm:p-4 flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <h3 className="font-bold text-base truncate">{title}</h3>
                                        <div className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                                            task.status === 'submitted' ? 'bg-green-100 text-green-700' :
                                            task.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {task.status === 'submitted' ? '已完成' : task.status === 'rejected' ? '已退回' : '待处理'}
                                        </div>
                                    </div>

                                    {/* Fixed Info Block (Important Context) */}
                                    {fixedInfo.length > 0 && (
                                        <div className="text-sm text-foreground/80 bg-muted/30 p-2 rounded-md mb-2 space-y-1">
                                            {fixedInfo.map(([k, v]) => (
                                                <div key={k} className="flex gap-2">
                                                    <span className="text-muted-foreground min-w-[3em]">{k}:</span>
                                                    <span className="font-medium">{String(v)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Other Info (Truncated) */}
                                    {otherInfo.length > 0 && (
                                        <div className="text-xs text-muted-foreground truncate">
                                            {otherInfo.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                                        </div>
                                    )}
                                </div>

                                <Link href={`/tasks/${task.id}`} className="shrink-0 self-center">
                                    <Button variant={task.status === 'submitted' ? 'outline' : 'default'} size="sm" className="h-8 px-3">
                                        {task.status === 'submitted' ? '查看' : task.status === 'rejected' ? '重填' : '整改'}
                                    </Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
            {filteredTasks.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                    没有找到匹配的任务
                </div>
            )}
        </div>
    </div>
  );
}
