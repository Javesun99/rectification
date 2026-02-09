import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import ExcelJS from 'exceljs';

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

  // Determine columns based on batch config (if batchId is provided)
  // This ensures export format matches import format
  let headers: string[] = [];

  if (batchId) {
    const batch = await prisma.importBatch.findUnique({ where: { id: Number(batchId) } });
    if (batch && batch.config_json) {
      try {
        const config = JSON.parse(batch.config_json);
        headers = Object.keys(config);
      } catch (e) {}
    }
  }

  const exportData = tasks.map((task: any) => {
    const ref = JSON.parse(task.reference_json || '{}');
    const sub = task.submission_json ? JSON.parse(task.submission_json) : {};

    // Base data with original Excel columns
    const rowData = { ...ref };

    // Overlay submission data?
    // Requirement: "Need all fields consistent with import header"
    // Usually import header is the 'reference'.
    // If user wants to see *answers* (submission), we should probably append them or replace them if they match.
    // Assuming submission fields might overlap or be new fields.
    // Let's keep original fields, and add status/submission info.

    // However, if the requirement is STRICTLY "consistent with import header",
    // it implies they want the original Excel back, maybe with updated values?
    // Or just the same columns?
    // If we just output `ref`, we get the original data.
    // If we want to see the *results*, we usually need extra columns or modified columns.

    // Let's assume the goal is to get a report that looks like the input but includes status and submitted data.
    // We will prioritize `ref` (original) keys order.

    return {
      ...ref, // Original data
      ...sub, // User feedback (might overwrite ref if keys match, or add new keys)
      '__Status': task.status === 'submitted' ? '已提交' : task.status === 'rejected' ? '已退回' : '待处理',
      '__Submitted At': task.submittedAt ? new Date(task.submittedAt).toLocaleString() : ''
    };
  });

  // Create workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Tasks');

  if (exportData.length > 0) {
    // If we have specific headers from config, use them first to preserve order
    // Then add system columns and any extra columns found in data

    const finalColumns: string[] = [];

    if (headers.length > 0) {
        finalColumns.push(...headers);
    }

    // Add system columns at the end (or beginning?)
    // Usually users want to see the original table first, then status.
    const systemColumns = ['__Status', '__Submitted At'];

    // Check for any other keys in data that weren't in headers (e.g. from submission or loose schema)
    const allDataKeys = new Set<string>();
    exportData.forEach((item: any) => Object.keys(item).forEach(k => allDataKeys.add(k)));

    // Add keys that are not in headers and not in system columns
    const extraKeys = Array.from(allDataKeys).filter(k => !headers.includes(k) && !systemColumns.includes(k));

    // Final Order: [Original Headers] + [Extra/Submission Fields] + [System Status]
    // Or if no headers found (multi-batch export), just use all keys.

    if (headers.length === 0) {
        // Fallback for multi-batch or legacy: use fixed order + rest
        // Note: 'County' might be in ref data already, 'Task ID' is internal.
        // Let's just dump all keys if we don't have a specific batch template.
        finalColumns.push(...Array.from(allDataKeys).sort());
    } else {
        finalColumns.push(...extraKeys);
        finalColumns.push(...systemColumns);
    }

    worksheet.columns = finalColumns.map(key => ({
      header: key,
      key: key,
      width: 20
    }));

    // Add rows one by one to avoid ExcelJS shared formula error
    // "Shared Formula master must exist above and or left of clone"
    // This error usually happens when adding rows with sparse data or complex structures
    // where ExcelJS tries to infer formulas but gets confused.
    // However, we are just dumping values.
    // The error might be caused by some values being interpreted as formulas (starting with =)
    // or internal ExcelJS state corruption.
    // Explicitly adding rows is safer.

    exportData.forEach(row => {
        // Sanitize data to prevent formula injection
        const safeRow: any = {};
        Object.keys(row).forEach(k => {
            let val = (row as any)[k];
            // If value starts with '=', prepend a quote to force it as string
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
