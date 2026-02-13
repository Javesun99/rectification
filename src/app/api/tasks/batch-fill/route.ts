import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

const INPUT_TYPES = ['text', 'image', 'date', 'prefill'];

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const currentUser = token ? await verifyToken(token) : null;
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { batchId, rows } = body as { batchId: number; rows: Record<string, any>[] };

    if (!batchId || !rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      return NextResponse.json({ error: '批次不存在' }, { status: 404 });
    }

    let config: Record<string, string> = {};
    try {
      config = JSON.parse(batch.config_json);
    } catch (e) {
      return NextResponse.json({ error: '批次配置解析失败' }, { status: 500 });
    }

    const hasImageField = Object.values(config).some(v => v.split('|')[0] === 'image');
    if (hasImageField) {
      return NextResponse.json({ error: '该批次包含图片上传字段，不支持Excel批量回填，请在线逐条填写' }, { status: 400 });
    }

    const inputKeys = Object.keys(config).filter(k => {
      const type = config[k].split('|')[0];
      return INPUT_TYPES.includes(type);
    });

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const taskId = Number(row['__TaskID']);
      if (!taskId || isNaN(taskId)) {
        skipped++;
        continue;
      }

      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task || task.batchId !== batchId) {
        errors.push(`任务ID ${taskId} 不存在或不属于该批次`);
        skipped++;
        continue;
      }

      if (currentUser.role === 'user' && currentUser.county && task.county !== currentUser.county) {
        errors.push(`任务ID ${taskId} 不在您的权限范围内`);
        skipped++;
        continue;
      }

      const existingSub = task.submission_json ? JSON.parse(task.submission_json) : {};
      const newSub: Record<string, any> = { ...existingSub };

      let hasData = false;
      inputKeys.forEach(k => {
        const val = row[k];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          newSub[k] = String(val).trim();
          hasData = true;
        }
      });

      if (!hasData) {
        skipped++;
        continue;
      }

      await prisma.task.update({
        where: { id: taskId },
        data: {
          submission_json: JSON.stringify(newSub),
          status: 'submitted',
          rejectionReason: null,
          submittedAt: new Date(),
          updatedAt: new Date(),
          logs: {
            create: {
              action: 'submit',
              operator: currentUser.username,
              reason: '通过Excel批量回填'
            }
          }
        }
      });
      updated++;
    }

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Batch fill error:', error);
    return NextResponse.json({ error: '批量回填失败' }, { status: 500 });
  }
}
