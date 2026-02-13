import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import ExcelJS from 'exceljs';

function formatDateString(val: any): any {
  if (typeof val !== 'string') return val;
  if (/^\w{3} \w{3} \d{2} \d{4} /.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    }
  }
  return val;
}

const EXPORT_TYPES = ['fixed', 'text', 'image', 'date', 'prefill', 'county'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const county = searchParams.get('county');
  const batchId = searchParams.get('batchId');

  const where: any = {};
  if (county) where.county = county;
  if (batchId) where.batchId = Number(batchId);

  const tasks = await prisma.task.findMany({
    where,
    include: { batch: true }
  });

  let config: Record<string, string> = {};
  let exportKeys: string[] = [];

  if (batchId) {
    const batch = await prisma.importBatch.findUnique({ where: { id: Number(batchId) } });
    if (batch && batch.config_json) {
      try {
        config = JSON.parse(batch.config_json);
        exportKeys = Object.keys(config).filter(k => {
          const type = config[k].split('|')[0];
          return EXPORT_TYPES.includes(type);
        });
      } catch (e) {}
    }
  }

  const systemColumns = ['__Status', '__Submitted At'];

  const exportData = tasks.map((task: any) => {
    const ref = JSON.parse(task.reference_json || '{}');
    const sub = task.submission_json ? JSON.parse(task.submission_json) : {};

    const row: Record<string, any> = {};

    if (exportKeys.length > 0) {
      exportKeys.forEach(k => {
        row[k] = sub[k] !== undefined ? sub[k] : ref[k] ?? '';
      });
    } else {
      Object.assign(row, ref, sub);
    }

    row['__Status'] = task.status === 'submitted' ? '已提交' : task.status === 'rejected' ? '已退回' : '待处理';
    row['__Submitted At'] = task.submittedAt ? new Date(task.submittedAt).toLocaleString() : '';

    return row;
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Tasks');

  if (exportData.length > 0) {
    const finalColumns = exportKeys.length > 0
      ? [...exportKeys, ...systemColumns]
      : Array.from(new Set(exportData.flatMap(r => Object.keys(r))));

    worksheet.columns = finalColumns.map(key => ({
      header: key,
      key: key,
      width: 20
    }));

    exportData.forEach(row => {
      const safeRow: any = {};
      finalColumns.forEach(k => {
        let val = row[k] ?? '';
        val = formatDateString(val);
        if (typeof val === 'string' && val.startsWith('=')) {
          val = "'" + val;
        }
        safeRow[k] = val;
      });
      worksheet.addRow(safeRow);
    });
  }

  const buf = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Disposition': 'attachment; filename="tasks_export.xlsx"',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });
}
