'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Camera } from 'lucide-react';

export default function TaskDetailContent({ id }: { id: string }) {
  const [task, setTask] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/tasks/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.task) {
          setTask(data.task);
          if (data.task.submission_json) {
            setFormData(JSON.parse(data.task.submission_json));
          }
        }
        setLoading(false);
      });
  }, [id]);

  const handleImageUpload = async (field: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Watermark Logic
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);

                // Add Watermark
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = `${img.width / 25}px Arial`;
                const text = `Task #${task.id} - ${new Date().toLocaleString()}`;
                ctx.fillText(text, 20, img.height - 20);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                setFormData(prev => ({ ...prev, [field]: dataUrl }));
            }
        };
        img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    try {
      const config = JSON.parse(task.batch.config_json);
      // Validation
      const errors: string[] = [];
      Object.entries(config).forEach(([key, typeStr]) => {
          const tStr = String(typeStr);
          if (tStr.includes('|required')) {
              if (!formData[key] || String(formData[key]).trim() === '') {
                  errors.push(`"${key}" 是必填项`);
              }
          }
      });

      if (errors.length > 0) {
          return alert(`提交失败，请检查以下问题：\n${errors.join('\n')}`);
      }

      const res = await fetch(`/api/tasks/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission: formData }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '提交失败');
      }

      alert('提交成功');
      router.back();
    } catch (e: any) {
      alert(e.message || '提交失败');
    }
  };

  if (loading || !task) return <div>加载中...</div>;

  const config = JSON.parse(task.batch.config_json);
  const ref = JSON.parse(task.reference_json);

  return (
    <div className="container mx-auto p-4 max-w-2xl">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">← 返回</Button>

        {task.status === 'rejected' && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md mb-6">
                <h3 className="font-bold flex items-center gap-2 mb-1">
                    ⚠️ 任务已退回
                </h3>
                <p className="text-sm">
                    <span className="font-semibold">退回原因：</span>
                    {task.rejectionReason}
                </p>
                <p className="text-xs text-red-600/80 mt-2">请根据上述原因修改后重新提交。</p>
            </div>
        )}

        <Card>
            <CardHeader>
                <CardTitle>任务详情</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {Object.entries(config).map(([key, type]) => {
                    const value = ref[key];
                    const fullType = type as string;
                    const valType = fullType.split('|')[0];
                    const isRequired = fullType.includes('|required');

                    if (valType === 'county') return null; // Hide permission field

                    return (
                        <div key={key} className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-1">
                                {key}
                                {isRequired && <span className="text-red-500">*</span>}
                            </label>

                            {valType === 'fixed' && (
                                <div className="p-2 bg-muted rounded-md text-sm">{value}</div>
                            )}

                            {valType === 'text' && (
                                <input
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={formData[key] || ''}
                                    onChange={e => setFormData({...formData, [key]: e.target.value})}
                                    placeholder={`请输入${key}`}
                                />
                            )}

                            {valType === 'date' && (
                                <input
                                    type="date"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={formData[key] || ''}
                                    onChange={e => setFormData({...formData, [key]: e.target.value})}
                                />
                            )}

                            {valType === 'image' && (
                                <div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleImageUpload(key, e)}
                                            className="hidden"
                                            id={`upload-${key}`}
                                        />
                                        <label htmlFor={`upload-${key}`}>
                                            <div className="flex items-center gap-2 cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2 rounded-md text-sm font-medium">
                                                <Camera className="w-4 h-4" />
                                                上传照片 (自动水印)
                                            </div>
                                        </label>
                                    </div>
                                    {formData[key] && (
                                        <img src={formData[key]} alt="Preview" className="mt-2 rounded-md border max-h-60" />
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                <Button onClick={handleSubmit} className="w-full mt-8">提交整改结果</Button>
            </CardContent>
        </Card>
    </div>
  );
}
